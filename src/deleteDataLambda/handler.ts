import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';
import { DynamoDbClient, DynamoDBEntity } from '@libs/data-access';
import { createEnvValidator, extractCompositeKey } from '@libs/utils';

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

let service;

function getService() {
  if (!service) {
    const  { TABLE_NAME, KMS_KEY_ID } = process.env
    const client = new DynamoDbClient<DynamoDBEntity>(TABLE_NAME, KMS_KEY_ID);
    service = client.getService();
  }

  return service;
}

export const lambdaHandler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
) => {
  let pk: string;
  let sk: string;

  const service = await getService();

  try {
    const compositeKey = extractCompositeKey(event.rawPath);
    pk = compositeKey.pk;
    sk = compositeKey.sk;
  } catch (error) {
    if (error instanceof Error) {
      throw new createError.BadRequest(error.message);
    }
    throw error;
  }

  try {
    await service.deleteByKey(pk, sk);

    return {
      statusCode: 200,
      body: { message: 'Entity deleted successfully' },
    };
  } catch (error) {
    if (createError.isHttpError(error)) {
      throw error;
    }

    throw new createError.InternalServerError()
  }
};

export const handler = middy()
  .use(envMiddleware)
  .use(httpErrorHandler())
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }) => (body && typeof body === 'object' ? JSON.stringify(body) : null),
        },
      ],
      defaultContentType: 'application/json',
    }),
  )
  .handler(lambdaHandler)
