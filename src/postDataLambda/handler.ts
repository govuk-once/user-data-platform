import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import {
  DynamoDbClient,
  DynamoDBEntity,
  DynamoDBAttributeMap,
} from '@libs/data-access';
import { createEnvValidator, extractCompositeKey } from '@libs/utils';

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

let service;

function getService() {
  if (!service) {
    const { TABLE_NAME, KMS_KEY_ID } = getEnv();
    const client = new DynamoDbClient<DynamoDBEntity>(TABLE_NAME, KMS_KEY_ID);
    service = client.getService();
  }
  return service;
}

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
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

  // After jsonBodyParser middleware, body will be parsed object
  const parsedData = event.body as unknown as Record<string, unknown>;

  if (!parsedData) {
    throw new createError.BadRequest();
  }

  // Validate that data, if present, is an object
  if (
    parsedData.data !== undefined &&
    (parsedData.data === null || typeof parsedData.data !== 'object')
  ) {
    throw new createError.BadRequest(
      'Invalid request: data field must be an object',
    );
  }

  // Validate ttl if present
  if (
    parsedData.ttl !== undefined &&
    (typeof parsedData.ttl !== 'number' || parsedData.ttl < 0)
  ) {
    throw new createError.BadRequest('Invalid request: ttl must be a number');
  }

  try {
    const entity: DynamoDBEntity = {
      pk,
      sk,
      data: parsedData.data
        ? (parsedData.data as DynamoDBAttributeMap)
        : undefined,
      ttl: parsedData.ttl as number | undefined,
    };

    await service.save(entity);

    return {
      statusCode: 201,
      body: { message: 'Entity saved successfully' },
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
