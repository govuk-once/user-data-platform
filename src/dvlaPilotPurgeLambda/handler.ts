import middy from '@middy/core';
import {
  AttributeValue,
  DeleteItemCommand,
  DynamoDBClient,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import {
  GetSecretValueCommand,
  SecretsManagerClient,
} from '@aws-sdk/client-secrets-manager';
import {
  captureLambdaHandler,
  getLogger,
  getTracer,
  injectLambdaContext,
  requireEnvVars,
} from '@libs/utils';

const { IDENTITY_TABLE_NAME, PURGE_KEY_SECRET_NAME } = requireEnvVars(
  'IDENTITY_TABLE_NAME',
  'PURGE_KEY_SECRET_NAME',
);

const { STACK: stack, SERVICE_NAME: serviceName = 'dvlaPilotPurge' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const secretsClient = new SecretsManagerClient({});
const dynamoClient = new DynamoDBClient({});

const BATCH_SIZE = 100;

interface IdentityTableKey {
  pk: string;
  sk: string;
}

const validatePurgeKey = async (suppliedKey: unknown): Promise<void> => {
  const secretResponse = await secretsClient.send(
    new GetSecretValueCommand({
      SecretId: PURGE_KEY_SECRET_NAME,
    }),
  );

  const expectedKey = secretResponse.SecretString;

  if (!expectedKey || suppliedKey !== expectedKey) {
    logger.error('Invalid purge key provided — aborting');
    throw new Error('Unauthorised: invalid purge key');
  }
};

const fetchDVLAKeys = async (): Promise<IdentityTableKey[]> => {
  const allKeys: IdentityTableKey[] = [];

  let lastEvaluatedKey: Record<string, AttributeValue> | undefined;

  do {
    const scanResponse = await dynamoClient.send(
      new ScanCommand({
        TableName: IDENTITY_TABLE_NAME,
        FilterExpression: 'begins_with(pk, :prefix)',
        ExpressionAttributeValues: {
          ':prefix': { S: 'dvla#' },
        },
        ProjectionExpression: 'pk, sk',
        ...(lastEvaluatedKey && {
          ExclusiveStartKey: lastEvaluatedKey,
        }),
      }),
    );

    for (const item of scanResponse.Items ?? []) {
      if (item.pk?.S && item.sk?.S) {
        allKeys.push({ pk: item.pk.S, sk: item.sk.S });
      }
    }

    lastEvaluatedKey = scanResponse.LastEvaluatedKey;
  } while (lastEvaluatedKey);

  return allKeys;
};

const deleteBatch = async (batch: IdentityTableKey[]): Promise<number> => {
  const results = await Promise.allSettled(
    batch.map(({ pk, sk }) =>
      dynamoClient.send(
        new DeleteItemCommand({
          TableName: IDENTITY_TABLE_NAME,
          Key: {
            pk: { S: pk },
            sk: { S: sk },
          },
        }),
      ),
    ),
  );

  const failureCount = results.filter(
    (result) => result.status === 'rejected',
  ).length;

  return failureCount;
};

export const lambdaHandler = async (event: { key: string }): Promise<void> => {
  await validatePurgeKey(event.key);

  logger.info('Purge key validated, scanning for DVLA records');

  const allKeys = await fetchDVLAKeys();

  const totalFetched = allKeys.length;

  if (totalFetched === 0) {
    logger.info('No DVLA records found');

    return;
  }

  logger.info('Completed DVLA record scan', { totalFetched });

  const totalBatches = Math.ceil(totalFetched / BATCH_SIZE);

  let totalFailureCount = 0;

  for (let offset = 0; offset < totalFetched; offset += BATCH_SIZE) {
    const batchNumber = Math.floor(offset / BATCH_SIZE) + 1;
    const batch = allKeys.slice(offset, offset + BATCH_SIZE);

    const batchFailureCount = await deleteBatch(batch);
    totalFailureCount += batchFailureCount;

    logger.info('Processed deletion batch', {
      batchNumber,
      totalBatches,
      batchSize: batch.length,
      batchFailed: batchFailureCount,
    });
  }

  logger.info('Purge completed', {
    totalFetched,
    totalSucceeded: totalFetched - totalFailureCount,
    totalFailed: totalFailureCount,
  });

  if (totalFailureCount > 0) {
    logger.warn(
      `${totalFailureCount} records failed to delete; re-execute the Lambda to retry.`,
    );
  }
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
