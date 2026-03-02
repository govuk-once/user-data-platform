import middy from '@middy/core';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  createEnvValidator,
  responseSanitiser,
  udpErrorHandling,
  zodValidator,
} from '@libs/utils';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';

import { v4 as uuidv4 } from 'uuid';
import { StartDsarResponse } from 'libs/utils/schemas/endpoints/sar-dsar/dsar';

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['QUEUE_URL'],
  optional: {},
});

const { STACK: stack, SERVICE_NAME: serviceName = 'udpDsar' } = process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const client = new SQSClient({});

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  const { QUEUE_URL } = getEnv();

  console.log({ QUEUE_URL });

  const dsarID = uuidv4();

  const dsarRequest = {
    dsarID,
    serviceName: event.headers['requesting-service'],
    serviceUserId: event.headers['requesting-service-user-id'],
  };

  console.log({ dsarRequest });

  const command = new SendMessageCommand({
    QueueUrl: QUEUE_URL,
    DelaySeconds: 0,
    MessageBody: JSON.stringify(dsarRequest),
  });

  console.log('DEBUG: command rady');

  try {
    await client.send(command);

    console.log('DEBUG: command sent');

    // tracer.putAnnotation('dsarRequestSuccess', true);
    return {
      statusCode: 200,
      body: { dsarID } satisfies StartDsarResponse,
    };
  } catch (e) {
    console.log('Debug error', e);
    throw e;
  }
};

export const handler = middy()
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  // .use({
  //   before: async () => {
  //     tracer.putAnnotation('stack', stack);
  //   },
  // })
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
  .use(zodValidator('startDsar', logger))
  .use(envMiddleware)
  .handler(lambdaHandler);
