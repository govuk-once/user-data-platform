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

let factory: ServiceFactory | undefined;

function getFactory(): ServiceFactory {
  if (!factory) {
    const { TABLE_NAME, IDENTITY_TABLE_NAME } = requireEnvVars(
      'TABLE_NAME',
      'IDENTITY_TABLE_NAME',
    );

    factory = new ServiceFactory({
      tableName: TABLE_NAME,
      identityTableName: IDENTITY_TABLE_NAME,
      kmsKeyId: process.env.KMS_KEY_ID,
      dynamoDbEndpointUrl: process.env.DYNAMODB_ENDPOINT,
      tracer,
      logger,
    });
  }
  return factory;
}

export const lambdaHandler = async () => {
  let instance: ServiceFactory;
  try {
    instance = getFactory();
  } catch (error) {
    logger.error('Failed to initialize ServiceFactory', { error });
    return {
      statusCode: 500,
      body: {
        status: 'unhealthy',
        error: 'Service configuration or factory initialization failed',
      },
    };
  }

  let dataTableService, identityTableService;
  try {
    dataTableService = instance.getService('data');
    identityTableService = instance.getService('identity');
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

  // Execute health checks concurrently to minimize latency
  const [dataTableActive, identityTableActive] = await Promise.all([
    dataTableService.checkHealth(),
    identityTableService.checkHealth(),
  ]);

  const isHealthy = dataTableActive && identityTableActive;

  if (!isHealthy) {
    logger.warn('Health check failed for one or more services', {
      dataTableActive,
      identityTableActive,
    });

    return {
      statusCode: 500,
      body: {
        status: 'unhealthy',
        details: {
          dataTable: dataTableActive ? 'healthy' : 'unhealthy',
          identityTable: identityTableActive ? 'healthy' : 'unhealthy',
        },
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
    before: () => {
      tracer.putAnnotation('stack', stack ?? 'unknown');
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
