import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';
import { DynamoDBEntity } from '@libs/data-access';
import { injectLambdaContext, getLogger } from '@libs/utils';
import { getTracer, captureLambdaHandler } from '@libs/utils';
import { ServiceFactory } from '@libs/data-access';
import {
  extractCompositeKey,
  DataPathSchema,
  responseSanitiser,
  zodValidator,
  createEnvValidator,
} from '@libs/utils';
const serviceName = 'udpGetData';
const environment = process.env;

const logger = getLogger({
  serviceName,
  environment,
});

const tracer = getTracer({
  serviceName,
});

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
  logger,
});

let factory;

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

export const lambdaHandler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
) => {
  try {
    const identity = await getFactory()
      .getService('identity')
      .getById(event.pathParameters.userId);
    tracer.putAnnotation('getIdentitySuccess', true);
    const entity = await getFactory()
      .getService('data')
      .getByKey(identity, event.pathParameters.proxy);
    tracer.putAnnotation('getDataSuccess', true);
    return {
      statusCode: 200,
      body: entity,
    };
  } catch (error) {
    tracer.putAnnotation('getDataSuccess', false);
    if (createError.isHttpError(error)) {
      throw error;
    }
    throw new createError.InternalServerError();
  }
};

export const handler = middy()
  .use(envMiddleware)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer))
  .use(zodValidator({ pathParameters: DataPathSchema }))
  .use(httpErrorHandler())
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
  .handler(lambdaHandler);
