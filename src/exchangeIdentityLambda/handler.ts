import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ServiceFactory } from '@libs/data-access';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  responseSanitiser,
  udpErrorHandling,
  zodValidator,
  ReadIdentityResponse,
  requireEnvVars,
} from '@libs/utils';

const { TABLE_NAME, IDENTITY_TABLE_NAME } = requireEnvVars(
  'TABLE_NAME',
  'IDENTITY_TABLE_NAME',
);

const { STACK: stack, SERVICE_NAME: serviceName = 'udpReadIdentity' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

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
    .getLinkedIdentity(
      event.headers['requesting-service'],
      event.headers['requesting-service-user-id'],
      event.queryStringParameters?.requiredService,
    );

  return {
    statusCode: 200,
    body: identity satisfies ReadIdentityResponse,
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
          serializer: ({ body }) => (body ? JSON.stringify(body) : null),
        },
      ],
      defaultContentType: 'application/json',
    }),
  )
  .use(responseSanitiser({}))
  .use(udpErrorHandling(logger))
  .use(zodValidator('exchangeIdentity', logger))
  .handler(lambdaHandler);
