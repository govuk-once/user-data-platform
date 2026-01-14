import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import { ServiceFactory } from '@libs/data-access';
import {
  createEnvValidator,
  zodValidator,
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  routes,
} from '@libs/utils';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpDeleteIdentity' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

let factory: ServiceFactory;

function getFactory() {
  if (!factory) {
    const { TABLE_NAME, KMS_KEY_ID } = getEnv();
    factory = new ServiceFactory({
      tableName: TABLE_NAME,
      kmsKeyId: KMS_KEY_ID,
      tracer,
    });
  }

  return factory;
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  tracer.putAnnotation('stack', stack);

  try {
    await getFactory()
      .getService('identity')
      .deleteById(event.pathParameters.identifier);

    return {
      statusCode: 200,
      body: 'Successfully Deleted Identity',
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
  .use(zodValidator({ pathParameters: routes.deleteIdentity.params }))
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
  .handler(lambdaHandler);
