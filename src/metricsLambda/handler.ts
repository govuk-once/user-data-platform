import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import {
  getLogger,
  getTracer,
  captureLambdaHandler,
  injectLambdaContext,
  udpErrorHandling,
  requireEnvVars,
} from '@libs/utils';
import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';

const { STACK: stack, SERVICE_NAME: serviceName = 'udpMetrics' } = process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const { IDENTITY_TABLE_NAME } = requireEnvVars('IDENTITY_TABLE_NAME');

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    ...(process.env.DYNAMODB_ENDPOINT
      ? { endpoint: process.env.DYNAMODB_ENDPOINT }
      : {}),
  }),
);

export const lambdaHandler = async () => {
  const counts: Record<string, number> = {};
  let totalRecords = 0;
  let exclusiveStartKey: Record<string, unknown> | undefined;

  logger.info('Starting identity table scan for link type metrics');

  do {
    const response = await client.send(
      new ScanCommand({
        TableName: IDENTITY_TABLE_NAME,
        ProjectionExpression: 'pk',
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    for (const item of response.Items ?? []) {
      totalRecords++;
      const pk = item.pk as string;
      const serviceName = pk.split('#')[0] ?? 'unknown';
      counts[serviceName] = (counts[serviceName] ?? 0) + 1;
    }

    exclusiveStartKey = response.LastEvaluatedKey;
  } while (exclusiveStartKey);

  const linkTypes = Object.entries(counts)
    .sort(([, a], [, b]) => b - a)
    .map(([serviceName, count]) => ({ serviceName, count }));

  logger.info('Identity table scan complete', { totalRecords, linkTypes });

  return {
    statusCode: 200,
    body: {
      totalRecords,
      distinctLinkTypes: linkTypes.length,
      linkTypes,
    },
  };
};

export const handler = middy()
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  .use({
    before: () => {
      tracer.putAnnotation('stack', stack ?? 'unknown');
    },
  })
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
  .use(udpErrorHandling(logger))
  .handler(lambdaHandler);
