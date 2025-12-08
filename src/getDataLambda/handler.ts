import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';
import { DynamoDbClient, DynamoDBEntity } from '@libs/data-access';
import { extractCompositeKey } from '@libs/utils';

const client = new DynamoDbClient<DynamoDBEntity>(process.env.TABLE_NAME, process.env.KMS_KEY_ID);
const service = client.getService();

export const lambdaHandler = async (
  event: APIGatewayProxyEventV2,
  context: Context,
) => {
  let pk: string;
  let sk: string;

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
    const entity = await service.getByKey(pk, sk);

    if (!entity) {
      throw new createError.NotFound();
    }

    return entity;
  } catch (error) {
    if (createError.isHttpError(error)) {
      throw error;
    }

    throw new createError.InternalServerError();
  }
};

export const handler = middy()
  .use(httpResponseSerializer({
    serializers: [
      {
        regex: /^application\/json$/,
        serializer: ({ body }) => body ? JSON.stringify(body) : null,
      },
    ],
    defaultContentType: 'application/json',
  }))
  .use(httpErrorHandler())
  .handler(lambdaHandler);
