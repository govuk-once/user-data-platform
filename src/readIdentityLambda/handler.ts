import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import { ServiceFactory } from '@libs/data-access';
import {
  createEnvValidator,
  responseSanitiser,
  zodValidator,
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
} from '@libs/utils';
import { identityEndpointPathSchema } from '@libs/schemas'

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

const { STACK: stack, SERVICE_NAME: serviceName = 'udpReadIdentity' } =
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
      tableName: TABLE_NAME,
      identityTableName: IDENTITY_TABLE_NAME,

      kmsKeyId: KMS_KEY_ID,
      tracer,
    });
  }

  return factory;
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  try {
    const identity = await getFactory()
      .getService('identity')
      .getByServiceId(
        event.pathParameters.serviceName,
        event.pathParameters.identifier,
      );

    return {
      statusCode: 200,
      body: identity,
    };
  } catch (error) {
    if (createError.isHttpError(error)) {
      throw error;
    }

    throw new createError.InternalServerError();
  }
};

export const handler = middy()
  .use(envMiddleware)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  .use({
    before: async () => {
      tracer.putAnnotation('stack', stack);
    },
  })
  .use(
    zodValidator({
      pathParameters: identityEndpointPathSchema,
    }),
  )
  .use(httpErrorHandler())
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
  .handler(lambdaHandler);
