import middy from '@middy/core';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ServiceFactory, IdentityInput } from '@libs/data-access';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  udpErrorHandling,
  zodValidator,
  CreateIdentityRequest,
  CreateIdentityResponse,
  requireEnvVars,
} from '@libs/utils';

const { TABLE_NAME, IDENTITY_TABLE_NAME } = requireEnvVars(
  'TABLE_NAME',
  'IDENTITY_TABLE_NAME',
);

const { STACK: stack, SERVICE_NAME: serviceName = 'udpCreateIdentity' } =
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
  logger,
});

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  const input = {
    ...(event.body as unknown as CreateIdentityRequest),
    serviceId: event.pathParameters.identifier,
    serviceName: event.pathParameters.serviceName,
  } as unknown as IdentityInput;

  await factory.getService('identity').linkIdentity(input);

  return {
    statusCode: 200,
    body: {
      message: 'Identity successfully created',
    } satisfies CreateIdentityResponse,
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
  .use(udpErrorHandling(logger))
  .use(jsonBodyParser())
  .use(zodValidator('createIdentity', logger))
  .handler(lambdaHandler);
