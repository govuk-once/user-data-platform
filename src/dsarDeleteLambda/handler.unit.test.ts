/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, SQSEvent } from 'aws-lambda';
import { beforeEach, describe, vi, expect, it } from 'vitest';
import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from './handler';

const dynamoMock = mockClient(DynamoDBDocumentClient);

process.env['TABLE_NAME'] = 'test-data-table';
process.env['IDENTITY_TABLE_NAME'] = 'test-identity-table';

const mockDsarId = 'abc12345-1234-1234-1234-123456789012';
const mockUdpId = 'udp-id-1234';

describe('dsarDeleteLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'dsarDeleteLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:dsarDeleteLambda',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/dsarDeleteLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    dynamoMock.reset();
    vi.clearAllMocks();
  });

  const createSQSEvent = (
    body: Record<string, unknown> = {
      dsarID: mockDsarId,
      batchNumber: 1,
      totalBatches: 3,
      keys: [
        { pk: mockUdpId, sk: 'resource/path1' },
        { pk: mockUdpId, sk: 'resource/path2' },
      ],
    },
  ): SQSEvent => ({
    Records: [
      {
        messageId: 'msg-1',
        receiptHandle: 'receipt-1',
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
        eventSourceARN: 'arn:aws:sqs:eu-west-2:123456:dsar-delete-queue',
        awsRegion: 'eu-west-2',
      },
    ],
  });

  describe('Successful operations', () => {
    it('should delete all data keys and all linked identities', async () => {
      const linkedIdentities = [
        {
          pk: 'app#user1',
          sk: mockUdpId,
          serviceName: 'app',
          serviceId: 'user1',
          udpId: mockUdpId,
        },
        {
          pk: 'dwp#dwp-id',
          sk: mockUdpId,
          serviceName: 'dwp',
          serviceId: 'dwp-id',
          udpId: mockUdpId,
        },
      ];

      dynamoMock.on(QueryCommand).resolves({ Items: linkedIdentities });
      dynamoMock.on(DeleteCommand).resolves({});

      const keys = [
        { pk: mockUdpId, sk: 'resource/path1' },
        { pk: mockUdpId, sk: 'resource/path2' },
        { pk: mockUdpId, sk: 'resource/path3' },
      ];

      const event = createSQSEvent({
        dsarID: mockDsarId,
        batchNumber: 1,
        totalBatches: 1,
        keys,
      });

      await handler(event, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteCommand);
      // 3 data deletes + 2 identity deletes
      expect(deleteCalls).toHaveLength(5);

      keys.forEach((key, index) => {
        expect(deleteCalls[index].args[0].input).toEqual({
          TableName: 'test-data-table',
          Key: { pk: key.pk, sk: key.sk },
          ConditionExpression: 'attribute_exists(pk)',
        });
      });

      expect(deleteCalls[3].args[0].input).toEqual({
        TableName: 'test-identity-table',
        Key: { pk: 'app#user1', sk: mockUdpId },
        ConditionExpression: 'attribute_exists(pk)',
      });
      expect(deleteCalls[4].args[0].input).toEqual({
        TableName: 'test-identity-table',
        Key: { pk: 'dwp#dwp-id', sk: mockUdpId },
        ConditionExpression: 'attribute_exists(pk)',
      });

      // Verify the GSI query for identities
      const queryCalls = dynamoMock.commandCalls(QueryCommand);
      expect(queryCalls).toHaveLength(1);
      expect(queryCalls[0].args[0].input).toMatchObject({
        TableName: 'test-identity-table',
        IndexName: 'sk-index',
        KeyConditionExpression: 'sk = :sk',
        ExpressionAttributeValues: { ':sk': mockUdpId },
      });
    });

    it('should handle data item not found gracefully and continue with remaining keys', async () => {
      const conditionalError = new Error('ConditionalCheckFailedException');
      conditionalError.name = 'ConditionalCheckFailedException';

      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock
        .on(DeleteCommand)
        .resolvesOnce({})
        .rejectsOnce(conditionalError)
        .resolvesOnce({});

      const keys = [
        { pk: mockUdpId, sk: 'resource/path1' },
        { pk: mockUdpId, sk: 'resource/path2' },
        { pk: mockUdpId, sk: 'resource/path3' },
      ];

      const event = createSQSEvent({
        dsarID: mockDsarId,
        batchNumber: 1,
        totalBatches: 1,
        keys,
      });

      await handler(event, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteCommand);
      expect(deleteCalls).toHaveLength(3);
    });

    it('should handle no linked identities gracefully', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(DeleteCommand).resolves({});

      const keys = [{ pk: mockUdpId, sk: 'resource/path1' }];

      const event = createSQSEvent({
        dsarID: mockDsarId,
        batchNumber: 1,
        totalBatches: 1,
        keys,
      });

      await handler(event, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteCommand);
      // Only data delete, no identity deletes
      expect(deleteCalls).toHaveLength(1);
    });
  });

  describe('Error handling', () => {
    it('should throw when DynamoDB delete fails with non-conditional error', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [{}] });
      dynamoMock.on(DeleteCommand).rejects(new Error('Internal Server Error'));

      const event = createSQSEvent();
      await expect(handler(event, mockContext)).rejects.toThrow(
        'Internal Server Error',
      );
    });
  });
});
