import middy from '@middy/core';
import type {
  AttributeValue as StreamAttributeValue,
  DynamoDBBatchResponse,
  DynamoDBRecord,
  DynamoDBStreamEvent,
} from 'aws-lambda';
import { DynamoDBClient, type AttributeValue } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  requireEnvVars,
} from '@libs/utils';
import {
  DsqlConnection,
  JsonSchema,
  LiveSchemaRepository,
  SCHEMA_EXTRACTOR_DB_ROLE,
  inferSchema,
  mergeSchemas,
} from '@libs/live-schema';
import { EncryptionService } from '@libs/data-access';

const { DSQL_ENDPOINT, AWS_REGION, DATA_TABLE_NAME } = requireEnvVars(
  'DSQL_ENDPOINT',
  'AWS_REGION',
  'DATA_TABLE_NAME',
);

const {
  STACK: stack,
  SERVICE_NAME: serviceName = 'udpLiveSchemaExtractor',
  KMS_KEY_ID: kmsKeyId,
  DYNAMO_ENDPOINT: dynamoDbEndpoint,
} = process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const repository = new LiveSchemaRepository(
  new DsqlConnection({
    endpoint: DSQL_ENDPOINT,
    region: AWS_REGION,
    user: SCHEMA_EXTRACTOR_DB_ROLE,
  }),
);

const encryption = kmsKeyId
  ? new EncryptionService({ kmsKeyId, tracer })
  : undefined;

const dynamo = DynamoDBDocumentClient.from(
  tracer.captureAWSv3Client(
    new DynamoDBClient(dynamoDbEndpoint ? { endpoint: dynamoDbEndpoint } : {}),
  ),
);

interface StreamItem {
  sequenceNumber: string;
  pk: string;
  sk: string;
  udpKey: string;
  /** The stored `data` attribute exactly as written (ciphertext when encrypted). */
  storedData: unknown;
  data: unknown;
}

/** The resource path is the UDP topic; normalise to a single leading slash. */
const toUdpKey = (resourcePath: string) =>
  `/${resourcePath.replace(/^\/+/, '')}`;

const readRecord = async (record: DynamoDBRecord): Promise<StreamItem> => {
  const image = unmarshall(
    record.dynamodb!.NewImage as Record<string, StreamAttributeValue> as Record<
      string,
      AttributeValue
    >,
  );
  const { pk, sk, data, __dataKey } = image as {
    pk: string;
    sk: string;
    data?: unknown;
    __dataKey?: string;
  };

  const decrypted =
    encryption && __dataKey
      ? (await encryption.decryptFields({ data, __dataKey }, ['data'])).data
      : data;

  return {
    sequenceNumber: record.dynamodb!.SequenceNumber!,
    pk,
    sk,
    udpKey: toUdpKey(sk),
    storedData: data,
    data: decrypted ?? {},
  };
};

/**
 * Stamps the evaluated version onto the record and clears the evaluation flag,
 * so the resulting MODIFY is dropped by the stream filter. The write is
 * conditional on `data` being unchanged since this event: if the record was
 * rewritten (or deleted) meanwhile, that newer write carries its own flag and
 * will be evaluated by its own event.
 */
const stamp = async (item: StreamItem, version: string) => {
  try {
    await dynamo.send(
      new UpdateCommand({
        TableName: DATA_TABLE_NAME,
        Key: { pk: item.pk, sk: item.sk },
        UpdateExpression: 'SET #schemaVersion = :version, #flag = :evaluated',
        ConditionExpression:
          item.storedData === undefined
            ? 'attribute_exists(pk) AND attribute_not_exists(#data)'
            : 'attribute_exists(pk) AND #data = :data',
        ExpressionAttributeNames: {
          '#schemaVersion': 'schemaVersion',
          '#flag': 'schemaEvaluationRequired',
          '#data': 'data',
        },
        ExpressionAttributeValues: {
          ':version': version,
          ':evaluated': false,
          ...(item.storedData === undefined
            ? {}
            : { ':data': item.storedData }),
        },
      }),
    );
  } catch (error) {
    if ((error as Error).name !== 'ConditionalCheckFailedException') {
      throw error;
    }
    logger.info('Record changed since event; skipping stamp', {
      udpKey: item.udpKey,
      sequenceNumber: item.sequenceNumber,
    });
  }
};

/**
 * Evolves the live schema for one udpKey from every record in the batch that
 * targets it, then stamps those records. One DSQL write per key per batch.
 */
const processKey = async (udpKey: string, items: StreamItem[]) => {
  const observed = items
    .map((item) => inferSchema(item.data))
    .reduce<JsonSchema>((acc, schema) => mergeSchemas(acc, schema), {});

  const { version, created } = await repository.evolve(udpKey, observed);
  if (created) {
    logger.info('Saved new live schema version', { udpKey, version });
  }

  for (const item of items) {
    await stamp(item, version);
  }
};

export const lambdaHandler = async (
  event: DynamoDBStreamEvent,
): Promise<DynamoDBBatchResponse> => {
  const failed = new Set<string>();
  const byKey = new Map<string, StreamItem[]>();

  for (const record of event.Records) {
    if (!record.dynamodb?.NewImage) continue;
    try {
      const item = await readRecord(record);
      byKey.set(item.udpKey, [...(byKey.get(item.udpKey) ?? []), item]);
    } catch (error) {
      logger.error('Failed to read stream record', {
        sequenceNumber: record.dynamodb.SequenceNumber,
        error,
      });
      failed.add(record.dynamodb.SequenceNumber!);
    }
  }

  for (const [udpKey, items] of byKey) {
    try {
      await processKey(udpKey, items);
    } catch (error) {
      logger.error('Failed to evolve live schema', { udpKey, error });
      for (const item of items) failed.add(item.sequenceNumber);
    }
  }

  return {
    batchItemFailures: [...failed].map((itemIdentifier) => ({
      itemIdentifier,
    })),
  };
};

export const handler = middy()
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  .use({
    before: async () => {
      tracer.putAnnotation('stack', stack);
    },
  })
  .handler(lambdaHandler);
