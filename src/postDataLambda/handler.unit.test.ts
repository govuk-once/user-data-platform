/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';
import { handler } from './handler';

vi.hoisted(() => {
  process.env['TABLE_NAME'] = 'test-table';
  process.env['IDENTITY_TABLE_NAME'] = 'identity-table';
});

const dynamoMock = mockClient(DynamoDBDocumentClient);

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

process.env['TABLE_NAME'] = 'dynamo';
process.env['IDENTITY_TABLE_NAME'] = 'identity-table';

describe('postDataLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'postDataLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:postDataLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/postDataLambda',
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

  const createEvent = (
    headers,
    pathParameters,
    body,
  ): APIGatewayProxyEventV2 => ({
    headers: {
      ...headers,
      'requesting-service': mockAppService,
      'requested-at': new Date().toDateString(),
      'Content-Type': 'application/json',
    },
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath: '',
    pathParameters,
    rawQueryString: '',
    version: '2.0',
    routeKey: '$default',
    body: JSON.stringify(body),
  });

  describe('successful operations', () => {
    it('should return 200 and save entity with valid data', async () => {
      const body = { data: { status: 'active', count: 5 } };
      const event = createEvent(
        { 'requesting-service-user-id': mockAppId },
        { resourcePath: 'topics' },
        body,
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(GetCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const response = (await handler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(200);
      const parsed = JSON.parse(response.body);
      expect(parsed.data).toEqual(body.data);
      expect(parsed.last_updated).toBeDefined();
    });

    it('should return 200 and save entity with TTL', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const body = {
        configuration: { expiryMechanism: 'DELETE', expiresAt: ttl },
        data: { status: 'active', count: 5 },
      };
      const event = createEvent(
        { 'requesting-service-user-id': mockAppId },
        { resourcePath: 'topics' },
        body,
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(GetCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const response = (await handler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(200);
      const parsed = JSON.parse(response.body);
      expect(parsed.data).toEqual(body.data);
      expect(parsed.last_updated).toBeDefined();
    });

    it('should return 200 and save entity with only pk and sk (no data field)', async () => {
      const body = { data: {} };
      const event = createEvent(
        { 'requesting-service-user-id': mockAppId },
        { resourcePath: 'topics' },
        body,
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(GetCommand).resolves({});
      dynamoMock.on(PutCommand).resolves({});

      const response = (await handler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(200);
      expect(JSON.parse(response.body)).toMatchObject({
        data: {},
      });
    });
  });

  describe('validation errors', () => {
    it('should return 400 when required header is not present', async () => {
      const body = { data: { status: 'active', count: 5 } };
      const event = createEvent({}, { resourcePath: 'topics' }, body);
      event.headers = { 'Content-Type': 'application/json' };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
      });
      const errorPaths = JSON.parse(result.body).errorPaths;
      expect(errorPaths).toContain('requesting-service');
      expect(errorPaths).toContain('requesting-service-user-id');
      expect(errorPaths).toContain('requested-at');
    });

    it('should return 400 when required header is invalid', async () => {
      const body = { data: { status: 'active', count: 5 } };
      const event = createEvent(
        { 'requesting-service-user-id': 123 },
        { resourcePath: 'topics' },
        body,
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

    it('should return 400 when path paremeter is missing', async () => {
      const body = { data: { status: 'active', count: 5 } };
      const event = createEvent(
        { 'requesting-service-user-id': 123 },
        { resourcePath: undefined },
        body,
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

    it('should return 400 when the request body is invalid missing', async () => {
      const invalidExpiry = Math.floor(new Date('01/01/2000').getTime() / 1000);
      const body = {
        data: { status: 'active', count: 5 },
        configuration: { expiryMechanism: 'DELETE', expiresAt: invalidExpiry },
      };
      const event = createEvent(
        { 'requesting-service-user-id': 'abc123' },
        { resourcePath: 'topics' },
        body,
      );

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['configuration.expiresAt'],
      });
    });

    it('should return 400 when body is missing', async () => {
      const event = createEvent(
        { 'requesting-service-user-id': 'app123' },
        { resourcePath: 'topics' },
        {},
      );

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['data'],
      });
    });
  });

  describe('error handling', () => {
    it('should return 500 when save operation fails', async () => {
      const event = createEvent(
        { 'requesting-service-user-id': mockAppId },
        { resourcePath: 'topics' },
        { data: { status: 'active', count: 5 } },
      );

      const mockError = new Error('DynamoDB Failure');
      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(PutCommand).rejects(mockError);

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 500,
        errorType: 'INTERNAL_SERVER_ERROR',
        errorMessage: 'Internal Server Error - unexpected error of name: Error',
      });
    });

    it('should return 404 when identity is not found', async () => {
      const event = createEvent(
        { 'requesting-service-user-id': mockAppId },
        { resourcePath: 'topics' },
        { data: { status: 'active', count: 5 } },
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
  });

  describe('out-of-sequence detention', () => {
    it('should return 409 when requested_at is older than stored last_updated', async () => {
      const oldTimestamp = '2020-01-01T00:00:00.000Z';
      const body = { data: { status: 'active' } };
      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
          requested_at: oldTimestamp,
        },
        { resourcePath: 'topics' },
        body,
      );

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(GetCommand).resolves({
        Item: {
          pk: mockUdpId,
          ks: 'topics',
          data: { old: 'data' },
          last_updated: '2026-04-09T12:00:00:00.000Z',
        },
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(409);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 409,
        errorType: 'CONFLICT',
      });
    });

     it('should return 400 when requested_at header is missing', async () => {
      const body = { data: { status: 'active' } };
      const event = createEvent(
        {
          'requesting-service-user-id': mockAppId,
        },
        { resourcePath: 'topics' },
        body,
      );

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
      });
    });
  });
});
