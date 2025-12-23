import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import { createEnvValidator, DataPathSchema, zodValidator } from '@libs/utils';
import { ServiceFactory } from '@libs/data-access';
import createHttpError from 'http-errors';
import { injectLambdaContext, getLogger } from '@libs/utils';
import { getTracer, captureLambdaHandler } from '@libs/utils';

const serviceName = 'udpPostData'; //TODO
const environment = process.env; // TODO

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

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  try {
    if (!event.body) {
      throw createHttpError.BadRequest();
    }

    const identity = await getFactory()
      .getService('identity')
      .getById(event.pathParameters.userId);

    await getFactory()
      .getService('data')
      .save(identity, event.pathParameters.proxy, event.body);
    tracer.putAnnotation('putEntitySuccess', true);
    return {
      statusCode: 201,
      body: { message: 'Entity saved successfully' },
    };
  } catch (error) {
    tracer.putAnnotation('putEntitySuccess', false);
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
  .use(jsonBodyParser())
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
