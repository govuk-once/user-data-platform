/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IdentityRecordEntity, SAREntity } from 'libs/data-access/types/Entity';
import { handler } from './handler';

vi.hoisted(() => {
  process.env['TABLE_NAME'] = 'test-table';
  process.env['IDENTITY_TABLE_NAME'] = 'identity-table';
});

const dynamoMock = mockClient(DynamoDBDocumentClient);

const mockAppService = 'app';
const mockAppId = 'app123';
const mockUdpId = 'abc123';
const mockSarId = 'sar-123';
const mockAppIdentity: IdentityRecordEntity = {
  pk: `app#${mockAppId}`,
  sk: mockUdpId,
  serviceName: mockAppService,
  serviceId: mockAppId,
  udpId: mockUdpId,
};

const mockSarRecord: SAREntity = {
  pk: mockUdpId,
  sk: `SAR/${mockSarId}`,
  sarID: mockSarId,
  ttl: 1800000000,
  expiresAt: 1746671000000,
  presignedURL: 'https://s3.amazonaws.com/bucket/file.json?X-Amz-Signature=...',
  bucket: 'test-bucket',
  objectKey: `${mockSarId}.json`,
};

describe('getSarStatusLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'getSarStatusLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:getSarStatusLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/getSarStatusLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    dynamoMock.reset();
    vi.clearAllMocks();
  });

  const createEvent = (headers, pathParameters): APIGatewayProxyEventV2 => ({
    headers: { ...headers, 'requesting-service': 'app' },
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath: '',
    pathParameters,
    rawQueryString: '',
    version: '2.0',
    routeKey: '$default',
  });

  describe('successful operations', () => {
    it('should return 200 with SAR data when SAR record is found', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
        },
        {
          sarId: mockSarId,
        },
      );

      dynamoMock
        .on(QueryCommand)
        .resolves({ Items: [mockAppIdentity] })
        .on(GetCommand)
        .resolves({ Item: mockSarRecord });

      const response = await handler(event, mockContext);

      expect(response.statusCode).toBe(200);
      expect(response.body).toBeDefined();
      const body = JSON.parse(response.body);
      expect(body.sarID).toBe(mockSarId);
      expect(body.expiresAt).toBe(mockSarRecord.expiresAt);
      expect(body.presignedUrl).toBe(mockSarRecord.presignedURL);
    });
  });

  describe('error cases', () => {
    it('should return 404 when identity is not found', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
        },
        {
          sarId: mockSarId,
        },
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const response = await handler(event, mockContext);

      expect(response.statusCode).toBe(404);
      expect(response.body).toBeDefined();
      const body = JSON.parse(response.body);
      expect(body.errorType).toBe('IDENTITY_NOT_FOUND');
    });

    it('should return 404 when SAR record is not found', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
        },
        {
          sarId: mockSarId,
        },
      );

      dynamoMock
        .on(QueryCommand)
        .resolves({ Items: [mockAppIdentity] })
        .on(GetCommand)
        .resolves({ Item: undefined });

      const response = await handler(event, mockContext);

      expect(response.statusCode).toBe(404);
      expect(response.body).toBeDefined();
      const body = JSON.parse(response.body);
      expect(body.errorType).toBe('SAR_NOT_FOUND');
      expect(body.sarId).toBe(mockSarId);
    });
  });
});
