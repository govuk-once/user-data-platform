import middy from '@middy/core';
import type { SQSEvent } from 'aws-lambda';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  requireEnvVars,
} from '@libs/utils';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { ServiceFactory } from '@libs/data-access';

const { TABLE_NAME, IDENTITY_TABLE_NAME, QUEUE_URL } = requireEnvVars(
  'TABLE_NAME',
  'IDENTITY_TABLE_NAME',
  'QUEUE_URL',
);

const { STACK: stack, SERVICE_NAME: serviceName = 'udpDsarRequest' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const sqsClient = new SQSClient({});

const factory = new ServiceFactory({
  tableName: TABLE_NAME,
  identityTableName: IDENTITY_TABLE_NAME,
  kmsKeyId: process.env.KMS_KEY_ID,
  tracer,
  logger
});

export const lambdaHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const { dsarID, serviceName, serviceUserId } = JSON.parse(record.body);

    logger.info('Processing DSAR request', {
      dsarID,
      serviceName,
      serviceUserId,
    });

    const identity = await factory
      .getService('identity')
      .getByServiceId(serviceName, serviceUserId);

    const udpId = identity.udpId;

    const totalItems = await factory.getService('data').countByUdpID(udpId);

    if (totalItems === 0) {
      logger.info('No data items found for DSAR reuest', { dsarID, udpId });
      continue;
    }

    const totalBatches = Math.ceil(totalItems / 100);
    let batchNumber = 1;
    let lastEvaluatedKey: Record<string, unknown> | undefined;

    do {
      const page = await factory
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
  .handler(lambdaHandler);
