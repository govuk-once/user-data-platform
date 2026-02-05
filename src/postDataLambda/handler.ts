import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import {
  injectLambdaContext,
  getLogger,
  getTracer,
  captureLambdaHandler,
  routes,
  zodValidator,
  createEnvValidator,
  generateErrorResponseFromHttpError
} from '@libs/utils';
import { ServiceFactory } from '@libs/data-access';
import createHttpError from 'http-errors';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpPostData' } = process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

let factory;

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
    if (!event.body) {
      throw createHttpError.BadRequest();
    }

    const identity = await getFactory()
      .getService('identity')
      .getByServiceId(event.headers['requesting-service'], event.headers['requesting-service-user-id']); //TODO: Refactor Identity service for service name usage.

    await getFactory()
      .getService('data')
      .save(identity, event.pathParameters.resourcePath, event.body);

    tracer.putAnnotation('putEntitySuccess', true);
    return {
      statusCode: 201,
      body: { message: 'Entity saved successfully' },
    };
  } catch (error) {
    tracer.putAnnotation('putEntitySuccess', false);
    let response = {
      statusCode: 500,
      errorType: 'INTERNAL_SERVER_ERROR',
      errorMessage: 'Internal Server Error'
    }
    if (createError.isHttpError(error)) {
      response = generateErrorResponseFromHttpError(error);
    }
    return {
      statusCode: response.statusCode,
      body: response
    };
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
  .use(jsonBodyParser())
  .use(
    zodValidator({
      pathParameters: routes.createData.params,
      headers: routes.createData.headers,
      body: routes.createData.body,
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
  .handler(lambdaHandler);
