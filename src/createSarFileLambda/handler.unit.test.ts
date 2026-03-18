/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './handler';
import type { Context, SQSEvent } from 'aws-lambda';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

vi.hoisted(() => {
  process.env['TABLE_NAME'] = 'test-data-table';
  process.env['IDENTITY_TABLE_NAME'] = 'test-identity-table';
  process.env['BUCKET_NAME'] = 'test-bucket';
  process.env['DLQ_URL'] =
    'https://sqs.eu-west-2.amazonaws.com/123345/test-dlq';
  process.env['KMS_KEY_ID'] = 'test-kms-key';
});

const sqsMock = mockClient(SQSClient);
const s3Mock = mockClient(S3Client);
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('createSarFileLambda', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'createSarFileLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:eu-west-2:123456789012:function:createSarFileLambda',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/createSarFileLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    sqsMock.reset();
    s3Mock.reset();
    dynamoMock.reset();
    vi.clearAllMocks();
  });

  const createSQSEvent = (body?: Record<string, unknown>): SQSEvent => ({
    Records: [
      {
        messageId: 'test-message-id',
        receiptHandle: 'test-receipt-handle',
        body: JSON.stringify(
          body ?? {
            sarID: 'test-sar-id',
            serviceName: 'test-service',
            serviceUserId: 'test-user-id',
          },
        ),
        attributes: {
          ApproximateReceiveCount: '1',
          SentTimestamp: '1234567890',
          SenderId: 'test-sender',
          ApproximateFirstReceiveTimestamp: '1234567890',
        },
        messageAttributes: {},
        md5OfBody: 'test-md5',
        eventSource: 'aws:sqs',
        eventSourceARN: 'arn:aws:sqs:eu-west-2:123456:sar-queue',
        awsRegion: 'eu-west-2',
      },
    ],
  });

  it('should process SAR request successfully', async () => {
    const mockUdpId = 'udp-id-1234';
    const mockServiceName = 'test-service';
    const mockServiceUserId = 'test-user-id';
    const mockSarId = 'test-sar-id';

    // Mock identity lookup
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-identity-table',
      })
      .resolves({
        Items: [
          {
            pk: `${mockServiceName.toLowerCase()}#${mockServiceUserId}`,
            sk: `IDENTITY_RECORD#`,
            udpId: mockUdpId,
            serviceName: mockServiceName,
            serviceId: mockServiceUserId,
          },
        ],
      });

    // Mock data records query
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-data-table',
      })
      .resolves({
        Items: [
          {
            pk: mockUdpId,
            sk: '/test/path1',
            data: { field1: 'value1', info: 'test data' },
            ttl: 12345,
          },
          {
            pk: mockUdpId,
            sk: '/test/path2',
            data: { field2: 'value2' },
          },
        ],
      });

    // Mock S3 upload
    s3Mock.on(PutObjectCommand).resolves({});

    const event = createSQSEvent({
      sarID: mockSarId,
      serviceName: mockServiceName,
      serviceUserId: mockServiceUserId,
    });

    await handler(event, mockContext);

    // Verify S3 was called with correct parameters
    expect(s3Mock.calls()).toHaveLength(1);
    const s3Call = s3Mock.call(0);
    const s3Input = s3Call.args[0].input as {
      Bucket: string;
      Key: string;
      Body: string;
      ContentType: string;
      Metadata?: Record<string, string>;
    };
    expect(s3Input).toMatchObject({
      Bucket: 'test-bucket',
      Key: `${mockSarId}.json`,
      ContentType: 'application/json',
      Metadata: {
        udpid: mockUdpId,
        sarid: mockSarId,
      },
    });

    // Verify the JSON content contains sanitized data
    const bodyContent = s3Input.Body;
    const parsedData = JSON.parse(bodyContent);
    expect(parsedData).toHaveLength(2);
    expect(parsedData[0]).toHaveProperty('resourcePath', '/test/path1');
    expect(parsedData[0]).toHaveProperty('data');
    expect(parsedData[0]).not.toHaveProperty('pk');
    expect(parsedData[0]).not.toHaveProperty('ttl');
  });

  it('should send message to DLQ on error', async () => {
    // Mock identity lookup to fail
    dynamoMock.on(QueryCommand).rejects(new Error('DynamoDB error'));

    // Mock SQS DLQ
    sqsMock.on(SendMessageCommand).resolves({});

    const event = createSQSEvent();

    await handler(event, mockContext);

    // Verify DLQ was called
    expect(sqsMock.calls()).toHaveLength(1);
    const sqsCall = sqsMock.call(0);
    expect(sqsCall.args[0].input).toMatchObject({
      QueueUrl: 'https://sqs.eu-west-2.amazonaws.com/123345/test-dlq',
    });
  });

  it('should send message to DLQ when identity is not found', async () => {
    // Mock identity lookup to return no results
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-identity-table',
      })
      .resolves({
        Items: [],
      });

    // Mock SQS DLQ
    sqsMock.on(SendMessageCommand).resolves({});

    const event = createSQSEvent();

    await handler(event, mockContext);

    // Verify DLQ was called
    expect(sqsMock.calls()).toHaveLength(1);
    const sqsCall = sqsMock.call(0);
    expect(sqsCall.args[0].input).toMatchObject({
      QueueUrl: 'https://sqs.eu-west-2.amazonaws.com/123345/test-dlq',
    });
  });

  it('should send message to DLQ when S3 upload fails', async () => {
    const mockUdpId = 'udp-id-1234';
    const mockServiceName = 'test-service';
    const mockServiceUserId = 'test-user-id';

    // Mock identity lookup
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-identity-table',
      })
      .resolves({
        Items: [
          {
            pk: `${mockServiceName.toLowerCase()}#${mockServiceUserId}`,
            sk: `IDENTITY_RECORD#`,
            udpId: mockUdpId,
            serviceName: mockServiceName,
            serviceId: mockServiceUserId,
          },
        ],
      });

    // Mock data records query
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-data-table',
      })
      .resolves({
        Items: [
          {
            pk: mockUdpId,
            sk: '/test/path1',
            data: { field1: 'value1' },
          },
        ],
      });

    // Mock S3 upload to fail
    s3Mock.on(PutObjectCommand).rejects(new Error('S3 upload failed'));

    // Mock SQS DLQ
    sqsMock.on(SendMessageCommand).resolves({});

    const event = createSQSEvent();

    await handler(event, mockContext);

    // Verify DLQ was called
    expect(sqsMock.calls()).toHaveLength(1);
    const sqsCall = sqsMock.call(0);
    expect(sqsCall.args[0].input).toMatchObject({
      QueueUrl: 'https://sqs.eu-west-2.amazonaws.com/123345/test-dlq',
    });

    // Verify S3 was attempted
    expect(s3Mock.calls()).toHaveLength(1);
  });

  it('should send message to DLQ when data records query fails', async () => {
    const mockUdpId = 'udp-id-1234';
    const mockServiceName = 'test-service';
    const mockServiceUserId = 'test-user-id';

    // Mock identity lookup to succeed
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-identity-table',
      })
      .resolves({
        Items: [
          {
            pk: `${mockServiceName.toLowerCase()}#${mockServiceUserId}`,
            sk: `IDENTITY_RECORD#`,
            udpId: mockUdpId,
            serviceName: mockServiceName,
            serviceId: mockServiceUserId,
          },
        ],
      });

    // Mock data records query to fail
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-data-table',
      })
      .rejects(new Error('Data query failed'));

    // Mock SQS DLQ
    sqsMock.on(SendMessageCommand).resolves({});

    const event = createSQSEvent();

    await handler(event, mockContext);

    // Verify DLQ was called
    expect(sqsMock.calls()).toHaveLength(1);
    const sqsCall = sqsMock.call(0);
    expect(sqsCall.args[0].input).toMatchObject({
      QueueUrl: 'https://sqs.eu-west-2.amazonaws.com/123345/test-dlq',
    });
  });

  it('should successfully create SAR file with no data records', async () => {
    const mockUdpId = 'udp-id-1234';
    const mockServiceName = 'test-service';
    const mockServiceUserId = 'test-user-id';
    const mockSarId = 'test-sar-id-empty';

    // Mock identity lookup
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-identity-table',
      })
      .resolves({
        Items: [
          {
            pk: `${mockServiceName.toLowerCase()}#${mockServiceUserId}`,
            sk: `IDENTITY_RECORD#`,
            udpId: mockUdpId,
            serviceName: mockServiceName,
            serviceId: mockServiceUserId,
          },
        ],
      });

    // Mock data records query to return empty
    dynamoMock
      .on(QueryCommand, {
        TableName: 'test-data-table',
      })
      .resolves({
        Items: [],
      });

    // Mock S3 upload
    s3Mock.on(PutObjectCommand).resolves({});

    const event = createSQSEvent({
      sarID: mockSarId,
      serviceName: mockServiceName,
      serviceUserId: mockServiceUserId,
    });

    await handler(event, mockContext);

    // Verify S3 was called
    expect(s3Mock.calls()).toHaveLength(1);
    const s3Call = s3Mock.call(0);
    const s3Input = s3Call.args[0].input as {
      Bucket: string;
      Key: string;
      Body: string;
      ContentType: string;
      Metadata?: Record<string, string>;
    };

    // Verify the JSON content is an empty array
    const bodyContent = s3Input.Body;
    const parsedData = JSON.parse(bodyContent);
    expect(parsedData).toHaveLength(0);
    expect(parsedData).toEqual([]);

    // Verify metadata is still set
    expect(s3Input.Metadata).toMatchObject({
      udpid: mockUdpId,
      sarid: mockSarId,
    });

    // Verify no DLQ message was sent
    expect(sqsMock.calls()).toHaveLength(0);
  });
});
