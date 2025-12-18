import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';
import { ServiceFactory, IdentityInput } from '@libs/data-access';
import {
  BodySchema,
  createEnvValidator,
  PathSchema,
  zodValidator,
} from '@libs/utils';
import { z } from 'zod';

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
    });
  }

  return factory;
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  try {
    const identity = await getFactory()
      .getService('identity')
      .getById(event.pathParameters.userId);

    return {
      statusCode: 200,
      body: identity
    };
  } catch (error) {
    console.log({error})
    if (createError.isHttpError(error)) {
      throw error;
    }

    throw new createError.InternalServerError();
  }
};

export const handler = middy()
  .use(envMiddleware)
  .use(zodValidator({ pathParameters: PathSchema }))
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
