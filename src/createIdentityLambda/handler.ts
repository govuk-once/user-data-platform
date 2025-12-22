import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import { ServiceFactory, IdentityInput } from '@libs/data-access';
import {
  CreateIdentityRequestSchema,
  createEnvValidator,
  IdentityPathSchema,
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

type CreatItemBody = z.infer<typeof CreateIdentityRequestSchema>;

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  try {
    const input = {
      ...(event.body as unknown as CreatItemBody),
      serviceId: event.pathParameters.userId,
    } as unknown as IdentityInput;

    await getFactory().getService('identity').create(input);

    return {
      statusCode: 201,
      body: 'Identity Successfully created',
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
  .use(jsonBodyParser())
  .use(
    zodValidator({
      pathParameters: IdentityPathSchema,
      body: CreateIdentityRequestSchema,
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
