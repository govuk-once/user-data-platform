import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import {
  getLogger,
  getTracer,
  captureLambdaHandler,
  injectLambdaContext,
  udpErrorHandling,
  zodValidator,
  requireEnvVars,
} from '@libs/utils';
import { ServiceFactory } from '@libs/data-access';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpHealthCheck' } =
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

let factory: ServiceFactory;
try {
  factory = new ServiceFactory({
    tableName: TABLE_NAME,
    identityTableName: IDENTITY_TABLE_NAME,
    kmsKeyId: process.env.KMS_KEY_ID,
    dynamoDbEndpointUrl: process.env.DYNAMODB_ENDPOINT,
    tracer,
    logger,
  });
} catch (error) {
  logger.error('Failed to initialise ServiceFactory', { error });
}

export const lambdaHandler = async () => {
  if (!factory) {
    return {
      statusCode: 500,
      body: {
        status: 'unhealthy',
        error: 'ServiceFactory failed to initialise',
      },
    };
  }

  try {
    factory.getService('data');
    factory.getService('identity');
  } catch (error) {
    logger.error('Health check service creation failed', { error });
    return {
      statusCode: 500,
      body: {
        status: 'unhealthy',
        error: 'Service creation failed',
      },
    };
  }

  return {
    statusCode: 200,
    body: { status: 'healthy' },
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
  .use(udpErrorHandling(logger))
  .use(zodValidator('healthCheck', logger))
  .handler(lambdaHandler);
