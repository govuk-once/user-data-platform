import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  responseSanitiser,
  udpErrorHandling,
  zodValidator,
  requireEnvVars,
} from '@libs/utils';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { v4 as uuidv4 } from 'uuid';
import { StartSarResponse } from 'libs/utils/schemas/endpoints/sar-dsar/sar';

const { QUEUE_URL } = requireEnvVars('QUEUE_URL');

const { STACK: stack, SERVICE_NAME: serviceName = 'udpSar' } = process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const client = new SQSClient({});

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  const sarID = uuidv4();

  const sarRequest = {
    sarID,
    serviceName: event.headers['requesting-service'],
    serviceUserId: event.headers['requesting-service-user-id'],
  };

  const command = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    DelaySeconds: 0,
    MessageBody: JSON.stringify(sarRequest),
  });

  await client.send(command);
  tracer.putAnnotation('sarRequestSuccess', true);
  return {
    statusCode: 202,
    body: { sarID } satisfies StartSarResponse,
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
  .use(zodValidator('startSar', logger))
  .handler(lambdaHandler);
