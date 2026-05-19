import middy from '@middy/core';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  injectLambdaContext,
  getLogger,
  getTracer,
  captureLambdaHandler,
  udpErrorHandling,
  zodValidator,
  responseSanitiser,
  requireEnvVars,
} from '@libs/utils';
import { ServiceFactory } from '@libs/data-access';
import { DataInput } from 'libs/data-access/types/Entity';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpPostData' } = process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const { TABLE_NAME, IDENTITY_TABLE_NAME, BUCKET_NAME } = requireEnvVars(
  'BUCKET_NAME',
  'TABLE_NAME',
  'IDENTITY_TABLE_NAME',
);

const factory = new ServiceFactory({
  tableName: TABLE_NAME,
  bucketName: BUCKET_NAME,
  identityTableName: IDENTITY_TABLE_NAME,
  kmsKeyId: process.env.KMS_KEY_ID,
  tracer,
  logger,
});

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  const identity = await factory
    .getService('identity')
    .getByServiceId(
      event.headers['requesting-service'],
      event.headers['requesting-service-user-id'],
    );

  const record = await factory
    .getService('data')
    .save(
      identity,
      event.pathParameters.resourcePath,
      event.body as unknown as DataInput,
    );

  tracer.putAnnotation('putEntitySuccess', true);
  return {
    statusCode: 200,
    body: record,
  };
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
  .use(responseSanitiser({}))
  .use(udpErrorHandling(logger))
  .use(jsonBodyParser())
  .use(zodValidator('postData', logger))
  .handler(lambdaHandler);
