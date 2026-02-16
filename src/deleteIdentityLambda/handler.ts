import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { ServiceFactory } from '@libs/data-access';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  createEnvValidator,
  udpErrorHandling,
  zodValidator,
  DeleteIdentityResponse
} from '@libs/utils';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpDeleteIdentity' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

let factory: ServiceFactory;

function getFactory() {
  if (!factory) {
    const { IDENTITY_TABLE_NAME, TABLE_NAME, KMS_KEY_ID } = getEnv();
    factory = new ServiceFactory({
      tableName: TABLE_NAME,
      identityTableName: IDENTITY_TABLE_NAME,
      kmsKeyId: KMS_KEY_ID,
      tracer,
    });
  }

  return factory;
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  await getFactory()
    .getService('identity')
    .deleteById(
      event.pathParameters.serviceName,
      event.pathParameters.identifier,
    );

  return {
    statusCode: 200,
    body: {
      message: 'Successfully Deleted Identity',
    } satisfies DeleteIdentityResponse,
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
  .use(zodValidator('deleteIdentity', logger))
  .use(envMiddleware)
  .handler(lambdaHandler);
