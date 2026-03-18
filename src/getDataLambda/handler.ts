import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  getLogger,
  getTracer,
  captureLambdaHandler,
  injectLambdaContext,
  responseSanitiser,
  udpErrorHandling,
  zodValidator,
  requireEnvVars,
} from '@libs/utils';
import { ServiceFactory } from '@libs/data-access';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpGetData' } = process.env;

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
  const identity = await factory
    .getService('identity')
    .getByServiceId(
      event.headers['requesting-service'],
      event.headers['requesting-service-user-id'],
    );

  const entity = await factory
    .getService('data')
    .getByKey(identity, event.pathParameters.resourcePath);

  return {
    statusCode: 200,
    body: entity,
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
  .use(zodValidator('getData', logger))
  .handler(lambdaHandler);
