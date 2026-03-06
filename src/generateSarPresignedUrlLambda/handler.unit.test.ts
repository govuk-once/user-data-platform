/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { handler } from './handler';
import type { Context, S3Event } from 'aws-lambda';
import { S3Client, HeadObjectCommand } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import * as presigner from '@aws-sdk/s3-request-presigner';

const s3Mock = mockClient(S3Client);
const dynamoMock = mockClient(DynamoDBDocumentClient);

// Mock getSignedUrl
vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

process.env['TABLE_NAME'] = 'test-data-table';
process.env['IDENTITY_TABLE_NAME'] = 'test-identity-table';

describe('generateSarPresignedUrlLambda', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'generateSarPresignedUrlLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:eu-west-2:123456789012:function:generateSarPresignedUrlLambda',
    memoryLimitInMB: '512',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/generateSarPresignedUrlLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 30000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  const mockGetSignedUrl = vi.mocked(presigner.getSignedUrl);

  beforeEach(() => {
    s3Mock.reset();
    dynamoMock.reset();
    vi.clearAllMocks();
    
    // Mock Date.now for consistent timestamp testing
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const createS3Event = (
    bucket: string = 'test-sar-bucket',
    key: string = 'test-sar-id.json',
  ): S3Event => ({
    Records: [
      {
        eventVersion: '2.1',
        eventSource: 'aws:s3',
        awsRegion: 'eu-west-2',
        eventTime: '2024-01-01T00:00:00.000Z',
        eventName: 's3:ObjectCreated:Put',
        userIdentity: {
          principalId: 'AWS:test',
        },
        requestParameters: {
          sourceIPAddress: '127.0.0.1',
        },
        responseElements: {
          'x-amz-request-id': 'test-request-id',
          'x-amz-id-2': 'test-id-2',
        },
        s3: {
          s3SchemaVersion: '1.0',
          configurationId: 'test-config',
          bucket: {
            name: bucket,
            ownerIdentity: {
              principalId: 'test-principal',
            },
            arn: `arn:aws:s3:::${bucket}`,
          },
          object: {
            key,
            size: 1024,
            eTag: 'test-etag',
            sequencer: 'test-sequencer',
          },
        },
      },
    ],
  });

  it('should successfully generate pre-signed URL and save SAR record', async () => {
    const mockSarId = 'test-sar-id-123';
    const mockUdpId = 'udp-id-456';
    const mockBucket = 'test-sar-bucket';
    const mockPresignedUrl = 'https://s3.amazonaws.com/presigned-url';

    // Mock S3 HeadObject to return metadata with udpId
    s3Mock.on(HeadObjectCommand).resolves({
      Metadata: {
        udpid: mockUdpId,
        sarid: mockSarId,
      },
    });

    // Mock getSignedUrl
    mockGetSignedUrl.mockResolvedValue(mockPresignedUrl);

    // Mock DynamoDB PutCommand
    dynamoMock.on(PutCommand).resolves({});

    const event = createS3Event(mockBucket, `${mockSarId}.json`);

    await handler(event, mockContext);

    // Verify S3 HeadObject was called
    expect(s3Mock.calls()).toHaveLength(1);
    const s3Call = s3Mock.call(0);
    expect(s3Call.args[0].input).toMatchObject({
      Bucket: mockBucket,
      Key: `${mockSarId}.json`,
    });

    // Verify getSignedUrl was called with correct parameters
    expect(mockGetSignedUrl).toHaveBeenCalledTimes(1);
    const signedUrlCall = mockGetSignedUrl.mock.calls[0];
    expect(signedUrlCall[2]).toEqual({ expiresIn: 7 * 24 * 60 * 60 }); // 7 days

    // Verify DynamoDB save was called with correct SAR record
    expect(dynamoMock.calls()).toHaveLength(1);
    const dynamoCall = dynamoMock.call(0);
    const dynamoInput = dynamoCall.args[0].input as any;
    
    const expectedNow = Math.floor(new Date('2024-01-01T00:00:00.000Z').getTime() / 1000);
    const expected7DaysExpiry = expectedNow + 7 * 24 * 60 * 60;
    const expected90DaysExpiry = expectedNow + 90 * 24 * 60 * 60;

    expect(dynamoInput.Item).toMatchObject({
      pk: mockUdpId,
      sk: `SAR/${mockSarId}`,
      sarID: mockSarId,
      ttl: expected90DaysExpiry,
      expiresAt: expected7DaysExpiry * 1000,
      presignedURL: mockPresignedUrl,
      bucket: mockBucket,
      objectKey: `${mockSarId}.json`,
    });
  });

  it('should handle URL-encoded object keys correctly', async () => {
    const mockUdpId = 'udp-id-456';
    const mockBucket = 'test-sar-bucket';
    const mockPresignedUrl = 'https://s3.amazonaws.com/presigned-url';
    const encodedKey = 'test+sar+id.json';
    const decodedKey = 'test sar id.json';

    // Mock S3 HeadObject
    s3Mock.on(HeadObjectCommand).resolves({
      Metadata: {
        udpid: mockUdpId,
      },
    });

    // Mock getSignedUrl
    mockGetSignedUrl.mockResolvedValue(mockPresignedUrl);

    // Mock DynamoDB
    dynamoMock.on(PutCommand).resolves({});

    const event = createS3Event(mockBucket, encodedKey);

    await handler(event, mockContext);

    // Verify the decoded key was used
    const s3Call = s3Mock.call(0);
    expect(s3Call.args[0].input).toMatchObject({
      Key: decodedKey,
    });

    // Verify DynamoDB record has decoded key
    const dynamoCall = dynamoMock.call(0);
    const dynamoInput = dynamoCall.args[0].input as any;
    expect(dynamoInput.Item.objectKey).toBe(decodedKey);
  });

  it('should throw error when udpId is missing from S3 metadata', async () => {
    const mockSarId = 'test-sar-id-123';
    const mockBucket = 'test-sar-bucket';

    // Mock S3 HeadObject to return metadata WITHOUT udpId
    s3Mock.on(HeadObjectCommand).resolves({
      Metadata: {},
    });

    const event = createS3Event(mockBucket, `${mockSarId}.json`);

    await expect(handler(event, mockContext)).rejects.toThrow(
      'Missing udpId in S3 object metadata',
    );

    // Verify S3 was called
    expect(s3Mock.calls()).toHaveLength(1);

    // Verify DynamoDB was NOT called
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should throw error when S3 HeadObject fails', async () => {
    const mockSarId = 'test-sar-id-123';
    const mockBucket = 'test-sar-bucket';

    // Mock S3 HeadObject to fail
    s3Mock.on(HeadObjectCommand).rejects(new Error('S3 access denied'));

    const event = createS3Event(mockBucket, `${mockSarId}.json`);

    await expect(handler(event, mockContext)).rejects.toThrow('S3 access denied');

    // Verify DynamoDB was NOT called
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should throw error when getSignedUrl fails', async () => {
    const mockSarId = 'test-sar-id-123';
    const mockUdpId = 'udp-id-456';
    const mockBucket = 'test-sar-bucket';

    // Mock S3 HeadObject
    s3Mock.on(HeadObjectCommand).resolves({
      Metadata: {
        udpid: mockUdpId,
      },
    });

    // Mock getSignedUrl to fail
    mockGetSignedUrl.mockRejectedValue(new Error('Failed to generate presigned URL'));

    const event = createS3Event(mockBucket, `${mockSarId}.json`);

    await expect(handler(event, mockContext)).rejects.toThrow(
      'Failed to generate presigned URL',
    );

    // Verify DynamoDB was NOT called
    expect(dynamoMock.calls()).toHaveLength(0);
  });

  it('should throw error when DynamoDB save fails', async () => {
    const mockSarId = 'test-sar-id-123';
    const mockUdpId = 'udp-id-456';
    const mockBucket = 'test-sar-bucket';
    const mockPresignedUrl = 'https://s3.amazonaws.com/presigned-url';

    // Mock S3 HeadObject
    s3Mock.on(HeadObjectCommand).resolves({
      Metadata: {
        udpid: mockUdpId,
      },
    });

    // Mock getSignedUrl
    mockGetSignedUrl.mockResolvedValue(mockPresignedUrl);

    // Mock DynamoDB to fail
    dynamoMock.on(PutCommand).rejects(new Error('DynamoDB error'));

    const event = createS3Event(mockBucket, `${mockSarId}.json`);

    await expect(handler(event, mockContext)).rejects.toThrow('DynamoDB error');

    // Verify DynamoDB was called
    expect(dynamoMock.calls()).toHaveLength(1);
  });

  it('should extract sarID correctly from object key', async () => {
    const mockSarId = 'abc123-def456-ghi789';
    const mockUdpId = 'udp-id-456';
    const mockBucket = 'test-sar-bucket';
    const mockPresignedUrl = 'https://s3.amazonaws.com/presigned-url';

    // Mock S3 HeadObject
    s3Mock.on(HeadObjectCommand).resolves({
      Metadata: {
        udpid: mockUdpId,
      },
    });

    // Mock getSignedUrl
    mockGetSignedUrl.mockResolvedValue(mockPresignedUrl);

    // Mock DynamoDB
    dynamoMock.on(PutCommand).resolves({});

    const event = createS3Event(mockBucket, `${mockSarId}.json`);

    await handler(event, mockContext);

    // Verify DynamoDB record has correct sarID
    const dynamoCall = dynamoMock.call(0);
    const dynamoInput = dynamoCall.args[0].input as any;
    expect(dynamoInput.Item.sarID).toBe(mockSarId);
    expect(dynamoInput.Item.sk).toBe(`SAR/${mockSarId}`);
  });

  it('should use correct TTL values for S3 object and presigned URL', async () => {
    const mockSarId = 'test-sar-id-123';
    const mockUdpId = 'udp-id-456';
    const mockBucket = 'test-sar-bucket';
    const mockPresignedUrl = 'https://s3.amazonaws.com/presigned-url';

    // Mock S3 HeadObject
    s3Mock.on(HeadObjectCommand).resolves({
      Metadata: {
        udpid: mockUdpId,
      },
    });

    // Mock getSignedUrl
    mockGetSignedUrl.mockResolvedValue(mockPresignedUrl);

    // Mock DynamoDB
    dynamoMock.on(PutCommand).resolves({});

    const event = createS3Event(mockBucket, `${mockSarId}.json`);

    await handler(event, mockContext);

    // Verify TTL values
    const dynamoCall = dynamoMock.call(0);
    const dynamoInput = dynamoCall.args[0].input as any;
    
    const expectedNow = Math.floor(new Date('2024-01-01T00:00:00.000Z').getTime() / 1000);
    const expected7Days = 7 * 24 * 60 * 60;
    const expected90Days = 90 * 24 * 60 * 60;

    // TTL for DynamoDB (90 days, no milliseconds)
    expect(dynamoInput.Item.ttl).toBe(expectedNow + expected90Days);
    
    // expiresAt for presigned URL (7 days, with milliseconds)
    expect(dynamoInput.Item.expiresAt).toBe((expectedNow + expected7Days) * 1000);
  });
});
