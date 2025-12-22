import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';
import { DynamoDbClient, DynamoDBEntity } from '@libs/data-access';
import { createEnvValidator, extractCompositeKey } from '@libs/utils';
import { injectLambdaContext, getLogger } from '@libs/utils';
import { getTracer, captureLambdaHandler } from '@libs/utils';

const serviceName = 'udpPostData' //TODO
const environment = process.env // TODO

const logger = getLogger({
  serviceName,
  environment
});

const tracer = getTracer({
  serviceName,
});

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

let service;

function getService() {
  if (!service) {
    const { TABLE_NAME, KMS_KEY_ID } = getEnv();
    const client = new DynamoDbClient<DynamoDBEntity>(TABLE_NAME, KMS_KEY_ID, tracer);
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
    tracer.putAnnotation('extractCompositeKey', true);
  } catch (error) {
      tracer.putAnnotation('extractCompositeKey', false);
    if (error instanceof Error) {
      throw new createError.BadRequest(error.message);
    }
    throw error;
  }

  // After jsonBodyParser middleware, body will be parsed object
  const parsedData = event.body as any;

  if (!parsedData) {
    throw new createError.BadRequest();
  }

  try {
    const entity: DynamoDBEntity = {
      pk,
      sk,
      data: parsedData.data,
      ttl: parsedData.ttl,
    };

    await service.save(entity);
    tracer.putAnnotation('putEntitySuccess', true);

    return {
      statusCode: 201,
      body: { message: 'Entity saved successfully' },
    };
  } catch (error) {
      tracer.putAnnotation('putEntitySu ccess', true);
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
  .use(jsonBodyParser())
  .use(httpErrorHandler())
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }) => body ? JSON.stringify(body) : null,
        },
      ],
      defaultContentType: 'application/json',
    }),
  )
  .handler(lambdaHandler);
