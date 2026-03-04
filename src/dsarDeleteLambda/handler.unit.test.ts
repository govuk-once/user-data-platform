/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, SQSEvent } from 'aws-lambda';
import { beforeEach, describe, vi, expect, it } from 'vitest';
import { SQSClient } from '@aws-sdk/client-sqs';
import { DeleteCommand, DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from './handler';

const sqsMock = mockClient(SQSClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

process.env['QUEUE_URL'] =
  'https://sqs.eu-west-2.amazonaws.com/123345/12223343432312/test-queue';
process.env['TABLE_NAME'] = 'test-data-table';
process.env['IDENTITY_TABLE_NAME'] = 'test-identity-table';

const mockDsarId = 'abc12345-1234-1234-1234-123456789012';
const mockRequestingService = 'GOVUKAPP';
const mockRequestingServiceUserId = '1231233-1231-1233-1131332ee21';
const mockUdpId = 'udp-id-1234-5678';

describe('dsarRequestLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'startDsarLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:dsarRequestLambda',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/startDsarLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    sqsMock.reset();
    dynamoMock.reset();
    vi.clearAllMocks();
  });

  const createSQSEvent = (
    body: Record<string, unknown> = {
      dsarID: mockDsarId,
      serviceName: mockRequestingService,
      serviceUserId: mockRequestingServiceUserId,
      batchNumber: 1,
      totalBatches: 3,
      keys: [
        { pk: mockUdpId, sk: '/resource/path1' },
        { pk: mockUdpId, sk: '/resource/path2' },
      ],
    },
    keys?: any[],
  ): SQSEvent => ({
    Records: [
      {
        messageId: 'msg-1',
        receiptHandle: 'reciept-1',
        body:
          keys?.length > 0
            ? JSON.stringify({ ...body, keys })
            : JSON.stringify(body),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '1234567890',
          SenderId: 'sender-1',
          ApproximateFirstReceiveTimestamp: '1234567890',
        },
        messageAttributes: {},
        md5OfBody: 'md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:eu-west-2:123456:dsar-queue',
        awsRegion: 'eu-west-2',
      },
    ],
  });

  describe('Successful operations', () => {
    it('Should delete all keys in the batch', async () => {
      dynamoMock.on(DeleteCommand).resolves({});

      const keys = [
        { pk: mockUdpId, sk: '/resource/path1' },
        { pk: mockUdpId, sk: '/resource/path2' },
        { pk: mockUdpId, sk: '/resource/path3' },
      ];
      const event = createSQSEvent(undefined, keys);

      await handler(event, mockContext);

      const delCalls = dynamoMock.commandCalls(DeleteCommand);
      expect(delCalls).toHaveLength(3);

      delCalls.forEach((call, index) => {
        expect(call.args[0].input).toEqual({
          TableName: 'test-data-table',
          Key: { pk: keys[index].pk, sk: keys[index].sk },
          ConditionExpression: 'attribute_exists(pk)',
        });
      });
    });

    it('should handle item not found gracefully and continue with reamaining keys', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';

      dynamoMock
        .on(DeleteCommand)
        .resolvesOnce({})
        .rejectsOnce(conditionalError)
        .resolvesOnce({});

      const keys = [
        { pk: mockUdpId, sk: '/resource/path1' },
        { pk: mockUdpId, sk: '/resource/path2' },
        { pk: mockUdpId, sk: '/resource/path3' },
      ];
      const event = createSQSEvent(undefined, keys);

      await handler(event, mockContext);

      const delCalls = dynamoMock.commandCalls(DeleteCommand);
      expect(delCalls).toHaveLength(3);
    });
  });

  describe('Error handling', () => {
    it('should throw when dynamoDb delete fails with non-conditional error', async () => {
      dynamoMock.on(DeleteCommand).rejects(new Error('Internal Server Error'));
      const event = createSQSEvent();

      await expect(handler(event, mockContext)).rejects.toThrow(
        'Internal Server Error',
      );
    });
  });
});
