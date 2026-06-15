/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from './handler';

vi.hoisted(() => {
  process.env['QUEUE_URL'] =
    'https://sqs.eu-west-2.amazonaws.com/123345/12223343432312/test-queue';
});

const sqsMock = mockClient(SQSClient);

const mockRequestingService = 'GOVUKAPP';
const mockRequestingServiceUserId = '1231233-1231-1233-1131332ee21';

describe('startSarLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'startSarLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:startSarLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/startSarLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    sqsMock.reset();
    vi.clearAllMocks();
  });

  const createEvent = (
    headers: Record<string, string> = {},
  ): APIGatewayProxyEventV2 => ({
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath: '/v1/sar/',
    rawQueryString: '',
    version: '2.0',
    routeKey: '$default',
  });

  describe('Successful operations', () => {
    it('Should return 202 and sarID when valid headers are provided', async () => {
      sqsMock.on(SendMessageCommand).resolves({});

      const event = createEvent({
        'requesting-service': mockRequestingService,
        'requesting-service-user-id': mockRequestingServiceUserId,
      });

      const response = await handler(event, mockContext);

      expect(response.statusCode).toEqual(202);

      const body = JSON.parse(response.body);
      expect(body.sarID).toBeDefined();
      expect(body.sarID).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );

      const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
      expect(sqsCalls).toHaveLength(1);

      const messageBody = JSON.parse(sqsCalls[0].args[0].input.MessageBody);
      expect(messageBody).toEqual({
        sarID: body.sarID,
        serviceName: mockRequestingService,
        serviceUserId: mockRequestingServiceUserId,
      });
    });
  });

  describe('Validation Errors', () => {
    it('should return 400 when required headers are missing', async () => {
      const event = createEvent();

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['requesting-service', 'requesting-service-user-id'],
      });
    });

    it('should return 400 when requesting-service-user-id header is missing', async () => {
      const event = createEvent({
        'requesting-service': mockRequestingService,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['requesting-service-user-id'],
      });
    });

    it('should return 400 when requesting-service header is missing', async () => {
      const event = createEvent({
        'requesting-service-user-id': mockRequestingServiceUserId,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['requesting-service'],
      });
    });
  });

  describe('error handling', () => {
    it('Should return 500 when sqs send fails', async () => {
      sqsMock.on(SendMessageCommand).rejects(new Error('SQS Failure'));

      const event = createEvent({
        'requesting-service': mockRequestingService,
        'requesting-service-user-id': mockRequestingServiceUserId,
      });

      const response = await handler(event, mockContext);

      expect(response.statusCode).toEqual(500);
      expect(JSON.parse(response.body)).toMatchObject({
        errorCode: 500,
        errorType: 'INTERNAL_SERVER_ERROR',
        errorMessage: 'Internal Server Error - unexpected error of name: Error',
      });
    });
  });
});
