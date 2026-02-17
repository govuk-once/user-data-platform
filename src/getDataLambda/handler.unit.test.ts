/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import {
  DynamoDBDocumentClient,
  GetCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';
import { handler } from './handler';

const dynamoMock = mockClient(DynamoDBDocumentClient);

process.env['TABLE_NAME'] = 'test-table';
process.env['IDENTITY_TABLE_NAME'] = 'identity-table';

const mockAppService = 'app';
const mockAppId = 'app123';
const mockUdpId = 'abc123';
const mockAppIdentity: IdentityRecordEntity = {
  pk: `app#${mockAppId}`,
  sk: mockUdpId,
  serviceName: mockAppService,
  serviceId: mockAppId,
  udpId: mockUdpId,
};

describe('getDataLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'getDataLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:getDataLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/getDataLambda',
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
    it('should return 200 with entity data when entity is found', async () => {
      const mockEntity = {
        pk: mockUdpId,
        sk: 'topics',
        name: 'Test Topic',
      };

      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
        },
        {
          resourcePath: 'topics',
        },
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(GetCommand).resolves({ Item: mockEntity });

      const response = await handler(event, mockContext);

      expect(response.statusCode).toEqual(200);
      expect(JSON.parse(response.body)).toMatchObject({
        name: 'Test Topic',
      });
    });
  });

  describe('validation errors', () => {
    it('should return 400 when required header is not present', async () => {
      const event = createEvent({}, { resourcePath: 'topics' });
      event.headers = {};

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['requesting-service', 'requesting-service-user-id'],
      });
    });

    it('should return 400 when required header is invalid', async () => {
      const event = createEvent(
        { 'requesting-service-user-id': 123 },
        { resourcePath: 'topics' },
      );

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['requesting-service-user-id'],
      });
    });

    it('should return 400 when path segments are empty', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        { resourcePath: undefined },
      );

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['resourcePath'],
      });
    });
  });

  describe('error handling', () => {
    it('should return 404 when Data entity is not found', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {
          resourcePath: 'topics',
        },
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(GetCommand).resolves({});

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 404,
        errorType: 'DATA_NOT_FOUND',
        errorMessage:
          'Resource not found on path topics: for identity app#app123',
        serviceName: mockAppService,
        serviceUserId: mockAppId,
        resourcePath: 'topics',
      });
    });

    it('should return 404 when identity is not found', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
        },
        {
          resourcePath: 'topics',
        },
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 404,
        errorType: 'IDENTITY_NOT_FOUND',
        errorMessage: `Identity not found with service: ${mockAppService} and id: ${mockAppId}`,
        serviceName: mockAppService,
        serviceUserId: mockAppId,
      });
    });

    it('should return 500 for unexpected errors', async () => {
      const unexpectedError = new Error('Database connection failed');
      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(GetCommand).rejects(unexpectedError);

      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
        },
        {
          resourcePath: 'topics',
        },
      );

      const result = await handler(event, mockContext);
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 500,
        errorType: 'INTERNAL_SERVER_ERROR',
        errorMessage: 'Internal Server Error - unexpected error of name: Error',
      });
    });
  });
});
