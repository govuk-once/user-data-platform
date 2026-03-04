import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2, SQSEvent } from 'aws-lambda';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  createEnvValidator,
  responseSanitiser,
  udpErrorHandling,
  zodValidator,
} from '@libs/utils';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { v4 as uuidv4 } from 'uuid';
import { StartDsarResponse } from 'libs/utils/schemas/endpoints/sar-dsar/dsar';
import { ServiceFactory } from '@libs/data-access';

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME', 'QUEUE_URL'],
  optional: { KMS_KEY_ID: undefined },
});

const { STACK: stack, SERVICE_NAME: serviceName = 'udpDsarRequest' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const sqsClient = new SQSClient({});

let factory: ServiceFactory | undefined;

function getFactory() {
  if (!factory) {
    const { IDENTITY_TABLE_NAME, TABLE_NAME, KMS_KEY_ID } = getEnv();
    factory = new ServiceFactory({
      tableName: TABLE_NAME,
      identityTableName: IDENTITY_TABLE_NAME,
      kmsKeyId: KMS_KEY_ID,
      tracer,
    });
  }

  return factory;
}

export const lambdaHandler = async (event: SQSEvent) => {
  const { QUEUE_URL } = getEnv();

  for (const record of event.Records) {
    const { dsarID, serviceName, serviceUserId } = JSON.parse(record.body);

    logger.info('Processing DSAR request', {
      dsarID,
      serviceName,
      serviceUserId,
    });

    const identity = await getFactory()
      .getService('identity')
      .getByServiceId(serviceName, serviceUserId);

    const udpId = identity.udpId;

    const totalItems = await getFactory()
      .getService('data')
      .countByUdpID(udpId);

    if (totalItems === 0) {
      logger.info('No data items found for DSAR reuest', { dsarID, udpId });
      continue;
    }

    const totalBatches = Math.ceil(totalItems / 100);
    let batchNumber = 1;
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const page = await getFactory()
        .getService('data')
        .getKeyPageByUdpID(udpId, lastEvaluatedKey);

      const message = {
        dsarID,
        serviceName,
        serviceUserId,
        batchNumber,
        totalBatches,
        keys: page.items,
      };

      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: QUEUE_URL,
          MessageBody: JSON.stringify(message),
        }),
      );

      console.log({ page });

      logger.info('Send DSAR delete batch', {
        dsarID,
        batchNumber,
        totalBatches,
        keysInBatch: page.items.length,
      });

      lastEvaluatedKey = page.lastEvaluatedKey;
      batchNumber++;
    } while (lastEvaluatedKey);
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
  .use(envMiddleware)
  .handler(lambdaHandler);
