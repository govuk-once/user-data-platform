import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ServiceFactory } from '@libs/data-access';
import {
  getLogger,
  injectLambdaContext,
  getTracer,
  captureLambdaHandler,
  udpErrorHandling,
  zodValidator,
  DeleteDataResponse,
  requireEnvVars,
} from '@libs/utils';

const serviceName = 'udpDeleteData';
const { STACK: stack } = process.env;

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
  logger
});

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  const identity = await factory
    .getService('identity')
    .getByServiceId(
      event.headers['requesting-service'],
      event.headers['requesting-service-user-id'],
    );

  await factory
    .getService('data')
    .deleteByKey(identity, event.pathParameters.resourcePath);

  return {
    statusCode: 200,
    body: {
      message: 'Entity deleted successfully',
    } satisfies DeleteDataResponse,
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
            body && typeof body === 'object' ? JSON.stringify(body) : null,
        },
      ],
      defaultContentType: 'application/json',
    }),
  )
  .use(udpErrorHandling(logger))
  .use(zodValidator('deleteData', logger))
  .handler(lambdaHandler);
