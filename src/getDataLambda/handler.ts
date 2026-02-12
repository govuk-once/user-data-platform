import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import {
  getLogger,
  getTracer,
  captureLambdaHandler,
  injectLambdaContext,
  generateErrorResponseFromHttpError,
} from '@libs/utils';
import {
  createEnvValidator,
  responseSanitiser,
  udpErrorHandling,
  zodValidator,
} from '@libs/middleware';
import {
  dataEndpointPathSchema,
  dataEndpointHeaderSchema,
  getDataResponseSchema,
  GetDataResponse,
} from '@libs/schemas';
import { ServiceFactory } from '@libs/data-access';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpGetData' } = process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
  logger,
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
    const identity = await getFactory()
      .getService('identity')
      .getByServiceId(
        event.headers['requesting-service'],
        event.headers['requesting-service-user-id'],
      );

    const entity = await getFactory()
      .getService('data')
      .getByKey(identity, event.pathParameters.resourcePath);

    return {
      statusCode: 200,
      body: entity satisfies GetDataResponse,
    };
  } catch (error) {
    let response = {
      statusCode: 500,
      errorType: 'INTERNAL_SERVER_ERROR',
      errorMessage: 'Internal Server Error',
    };
    if (createError.isHttpError(error)) {
      response = generateErrorResponseFromHttpError(error);
    }
    return {
      statusCode: response.statusCode,
      body: response,
    };
  }
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
  .use(udpErrorHandling())
  .use(
    zodValidator({
      pathParameters: dataEndpointPathSchema,
      headers: dataEndpointHeaderSchema,
      response: getDataResponseSchema,
    }, logger),
  )
  .use(envMiddleware)
  .handler(lambdaHandler);
