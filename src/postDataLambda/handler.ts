import middy from '@middy/core';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import {
  injectLambdaContext,
  getLogger,
  getTracer,
  captureLambdaHandler,
  generateErrorResponseFromHttpError,
} from '@libs/utils';
import {
  createEnvValidator,
  udpErrorHandling,
  zodValidator,
} from '@libs/middleware';
import type { PostDataResponse } from '@libs/schemas';
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
    const identity = await getFactory()
      .getService('identity')
      .getByServiceId(
        event.headers['requesting-service'],
        event.headers['requesting-service-user-id'],
      );

    await getFactory()
      .getService('data')
      .save(identity, event.pathParameters.resourcePath, event.body);

    tracer.putAnnotation('putEntitySuccess', true);
    return {
      statusCode: 200,
      body: { message: 'Entity saved successfully' } satisfies PostDataResponse,
    };
  } catch (error) {
    tracer.putAnnotation('putEntitySuccess', false);
    throw error;
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
          serializer: ({ body }) => (body ? JSON.stringify(body) : null),
        },
      ],
      defaultContentType: 'application/json',
    }),
  )
  .use(udpErrorHandling(logger))
  .use(jsonBodyParser())
  .use(zodValidator('postData', logger))
  .use(envMiddleware)
  .handler(lambdaHandler);
