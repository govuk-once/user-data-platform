import middy from '@middy/core';
import type { SQSEvent } from 'aws-lambda';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  createEnvValidator,
} from '@libs/utils';

import { ServiceFactory } from '@libs/data-access';

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

const { STACK: stack, SERVICE_NAME: serviceName = 'udpDsarRequest' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

let factory: ServiceFactory | undefined;

function getFactory() {
  if (!factory) {
    const { TABLE_NAME, KMS_KEY_ID, IDENTITY_TABLE_NAME } = getEnv();
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
  for (const record of event.Records) {
    const { dsarID, batchNumber, totalBatches, keys } = JSON.parse(record.body);

    logger.info('Processing DSAR request', {
      dsarID,
      batchNumber,
      totalBatches,
    });

    let deletedCount = 0;

    const dataService = getFactory().getService('data');

    for (const key of keys) {
      try {
        await dataService.deleteByKey(
          {
            pk: '',
            sk: '',
            udpId: key.pk,
            serviceId: '',
            serviceName: '',
          },
          key.sk,
        );
      } catch (error) {
        if (error.name === 'DataNotFoundError') {
          logger.warn('Items not found during DSAR delete', {
            dsarID,
            ...key,
          });
        } else {
          throw error;
        }
      }

      deletedCount++;
    }

    logger.info('Completed DSAR delete batch', {
      dsarID,
      batchNumber,
      totalBatches,
      deletedCount,
    });

    const identityService = getFactory().getService('identity');
    const udpId = keys[0].pk;

    await identityService.deleteAllByUdpId(udpId);
    logger.info('Deleted identity records', {
      dsarID,
      udpId,
    });
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
