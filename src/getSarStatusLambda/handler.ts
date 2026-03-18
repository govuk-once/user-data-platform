import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  getLogger,
  getTracer,
  captureLambdaHandler,
  injectLambdaContext,
  createEnvValidator,
  responseSanitiser,
  udpErrorHandling,
  zodValidator,
  GetSarStatusResponse,
  SarNotFoundError,
  requireEnvVars,
} from '@libs/utils';
import { ServiceFactory } from '@libs/data-access';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpGetSarStatus' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const { TABLE_NAME, IDENTITY_TABLE_NAME } = requireEnvVars(
  'TABLE_NAME',
  'IDENTITY_TABLE_NAME',
);

const factory = new ServiceFactory({
  tableName: TABLE_NAME,
  identityTableName: IDENTITY_TABLE_NAME,
  kmsKeyId: process.env.KMS_KEY_ID,
  tracer,
});

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  const sarId = event.pathParameters?.sarId;

  if (!sarId) {
    throw new SarNotFoundError('SAR ID is required', sarId);
  }

  logger.info('Getting SAR status', { sarId });

  // Get the identity record from the requesting service
  const identity = await factory
    .getService('identity')
    .getByServiceId(
      event.headers['requesting-service'],
      event.headers['requesting-service-user-id'],
    );

  logger.info('Retrieved identity', { udpId: identity.udpId, sarId });

  // Query for the SAR record
  const sarRecord = await factory.getService('sar').get({
    pk: identity.udpId,
    sk: `SAR/${sarId}`,
  });

  if (!sarRecord) {
    logger.info('SAR record not found', { sarId, udpId: identity.udpId });
    throw new SarNotFoundError('SAR record not found', sarId);
  }

  logger.info('SAR record found', {
    sarId,
    udpId: identity.udpId,
    expiresAt: sarRecord.expiresAt,
  });

  tracer.putAnnotation('sarRecordFound', true);

  return {
    statusCode: 200,
    body: {
      sarID: sarRecord.sarID,
      expiresAt: sarRecord.expiresAt,
      presignedUrl: sarRecord.presignedURL,
    } satisfies GetSarStatusResponse,
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
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }) =>
            body && typeof body === 'object' ? JSON.stringify(body) : '',
        },
      ],
      defaultContentType: 'application/json',
    }),
  )
  .use(responseSanitiser({}))
  .use(udpErrorHandling(logger))
  .use(zodValidator('getSarStatus', logger))
  .handler(lambdaHandler);
