/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, SQSEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from './handler';

vi.hoisted(() => {
  process.env['QUEUE_URL'] =
    'https://sqs.eu-west-2.amazonaws.com/123345/12223343432312/test-queue';
  process.env['TABLE_NAME'] = 'test-data-table';
  process.env['IDENTITY_TABLE_NAME'] = 'test-identity-table';
});

const sqsMock = mockClient(SQSClient);
const dynamoMock = mockClient(DynamoDBDocumentClient);

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
    },
  ): SQSEvent => ({
    Records: [
      {
        messageId: 'msg-1',
        receiptHandle: 'reciept-1',
        body: JSON.stringify(body),
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

  const mockIdentityLookup = () => {
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-identity-table',
      })
      .resolves({
        Items: [
          {
            pk: `${mockRequestingService.toLowerCase()}#${mockRequestingServiceUserId}`,
            sk: mockUdpId,
            udpId: mockUdpId,
            serviceId: mockRequestingServiceUserId,
            serviceName: mockRequestingService,
          },
        ],
      });
  };

  const mockCountQuery = (count: number) => {
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-data-table',
        Select: 'COUNT',
      })
      .resolves({
        Count: count,
        LastEvaluatedKey: undefined,
      });
  };

  const mockPageQuery = (
    items: Array<{ pk: string; sk: string }>,
    lastEvaluatedKey?: Record<string, unknown>,
  ) => {
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-data-table',
        ProjectionExpression: 'pk, sk',
      })
      .resolves({
        Items: items,
        LastEvaluatedKey: lastEvaluatedKey,
      });
  };

  describe('Successful operations', () => {
    it('Should process message, resolve identity, query keys and send batched messages', async () => {
      mockIdentityLookup();
      mockCountQuery(2);

      const keys = [
        { pk: mockUdpId, sk: 'resource/path1' },
        { pk: mockUdpId, sk: 'resource/path2' },
      ];
      mockPageQuery(keys);

      sqsMock.on(SendMessageCommand).resolves({});

      const event = createSQSEvent();
      await handler(event, mockContext);

      const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
      expect(sqsCalls).toHaveLength(1);

      const messageBody = JSON.parse(sqsCalls[0].args[0].input.MessageBody!);
      expect(messageBody).toEqual({
        dsarID: mockDsarId,
        serviceName: mockRequestingService,
        serviceUserId: mockRequestingServiceUserId,
        batchNumber: 1,
        totalBatches: 1,
        keys,
      });
    });

    it('Should correctly calculate batches and increment batch number', async () => {
      mockIdentityLookup();
      mockCountQuery(250);

      const page1Keys = Array.from({ length: 100 }, (_, i) => ({
        pk: mockUdpId,
        sk: `/resource/path${i}`,
      }));

      const page2Keys = Array.from({ length: 100 }, (_, i) => ({
        pk: mockUdpId,
        sk: `/resource/path${100 + i}`,
      }));

      const page3Keys = Array.from({ length: 50 }, (_, i) => ({
        pk: mockUdpId,
        sk: `/resource/path${200 + i}`,
      }));

      dynamoMock
        .on(QueryCommand, {
          TableName: 'test-data-table',
          ProjectionExpression: 'pk, sk',
        })
        .resolvesOnce({
          Items: page1Keys,
          LastEvaluatedKey: { pl: mockUdpId, sk: 'resource/path99' },
        })
        .resolvesOnce({
          Items: page2Keys,
          LastEvaluatedKey: { pl: mockUdpId, sk: 'resource/path199' },
        })
        .resolvesOnce({
          Items: page3Keys,
          LastEvaluatedKey: undefined,
        });

      sqsMock.on(SendMessageCommand).resolves({});

      const event = createSQSEvent();
      await handler(event, mockContext);

      const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
      expect(sqsCalls).toHaveLength(3);

      const batch1 = JSON.parse(sqsCalls[0].args[0].input.MessageBody!);
      expect(batch1.batchNumber).toBe(1);
      expect(batch1.totalBatches).toBe(3);
      expect(batch1.keys).toHaveLength(100);

      const batch2 = JSON.parse(sqsCalls[1].args[0].input.MessageBody!);
      expect(batch2.batchNumber).toBe(2);
      expect(batch2.totalBatches).toBe(3);
      expect(batch2.keys).toHaveLength(100);

      const batch3 = JSON.parse(sqsCalls[2].args[0].input.MessageBody!);
      expect(batch3.batchNumber).toBe(3);
      expect(batch3.totalBatches).toBe(3);
      expect(batch3.keys).toHaveLength(50);
    });

    it('should send no messages when no data items exist for a usee', async () => {
      mockIdentityLookup();
      mockCountQuery(0);

      const event = createSQSEvent();
      await handler(event, mockContext);

      const sqsCalls = sqsMock.commandCalls(SendMessageCommand);
      expect(sqsCalls).toHaveLength(0);
    });
  });

  describe('Error handling', () => {
    it('should throw when identity is not found', async () => {
      dynamoMock
        .on(QueryCommand, {
          TableName: 'test-identity-table',
        })
        .resolves({
          Items: [],
        });

      const event = createSQSEvent();
      await expect(handler(event, mockContext)).rejects.toThrow();
    });

    it('should throw when dynamo query fails', async () => {
      mockIdentityLookup();

      dynamoMock
        .on(QueryCommand, {
          TableName: 'test-data-table',
          Select: 'COUNT',
        })
        .rejects(new Error('DynamoDB Error'));

      const event = createSQSEvent();
      await expect(handler(event, mockContext)).rejects.toThrow(
        'DynamoDB Error',
      );
    });

    it('should throw when sqs sed fails', async () => {
      mockIdentityLookup();
      mockCountQuery(1);
      mockPageQuery([{ pk: mockUdpId, sk: '/resource/path1' }]);

      sqsMock.on(SendMessageCommand).rejects(new Error('SQS Failure'));

      const event = createSQSEvent();
      await expect(handler(event, mockContext)).rejects.toThrow('SQS Failure');
    });
  });
});
