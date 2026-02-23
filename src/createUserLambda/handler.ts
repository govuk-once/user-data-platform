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
  createEnvValidator,
  udpErrorHandling,
  zodValidator,
  CreateUserRequest,
  CreateUserResponse,
} from '@libs/utils';

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

const { STACK: stack, SERVICE_NAME: serviceName = 'udpCreateUser' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

let factory: ServiceFactory;

function getFactory() {
  if (!factory) {
    const { IDENTITY_TABLE_NAME, TABLE_NAME, KMS_KEY_ID } = getEnv();
    factory = new ServiceFactory({
      identityTableName: IDENTITY_TABLE_NAME,
      tableName: TABLE_NAME,
      kmsKeyId: KMS_KEY_ID,
      tracer,
    });
  }

  return factory;
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  const input = {
    ...(event.body as unknown as CreateUserRequest),
  } as unknown as IdentityInput;

  await getFactory().getService('identity').createAppUser(input);

  return {
    statusCode: 204,
    body: {} satisfies CreateUserResponse,
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
  .use(zodValidator('createUser', logger))
  .use(envMiddleware)
  .handler(lambdaHandler);
