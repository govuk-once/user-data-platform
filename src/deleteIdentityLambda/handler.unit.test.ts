/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './handler';

import {
  DynamoDBDocumentClient,
  DeleteCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';

const dynamoMock = mockClient(DynamoDBDocumentClient);

process.env['TABLE_NAME'] = 'test-table';
process.env['IDENTITY_TABLE_NAME'] = 'identity-table';

describe('deleteIdentityLambda', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'deleteIdentityLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:deleteIdentityLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/deleteIdentityLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

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

  beforeEach(() => {
    dynamoMock.reset();
    vi.resetAllMocks();
  });

  describe('Validation Errors', () => {
    it('Should throw a bad request if the identifier is not set in the path params', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockAppService}/${mockAppId}`,
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /v1/identity/{serviceName}/{identifier}',
        pathParameters: {
          identifier: undefined,
        },
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
        errorMessage: 'Validation Errors',
        errorPaths: ['identifier', 'serviceName'],
      });
    });
  });

  describe('Happy Paths', () => {
    it('Should return a 200 if record is successfuly Deleted', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
          'requesting-service': 'app',
          'requesting-service-user-id': 'test-user-id',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockAppService}/${mockAppId}`,
        pathParameters: {
          identifier: mockAppId,
          serviceName: mockAppService,
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{identifier}',
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(DeleteCommand).resolves({});

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        message: 'Successfully Deleted Identity',
      });
    });
  });

  describe('Error paths', () => {
    it('Should return a 404 if app user cannot be found', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
          'requesting-service': 'app',
          'requesting-service-user-id': 'test-user-id',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockAppService}/${mockAppId}`,
        pathParameters: {
          identifier: mockAppId,
          serviceName: mockAppService,
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{identifier}',
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 404,
        errorType: 'IDENTITY_NOT_FOUND',
        errorMessage: 'Identity not found with service: app and id: app123',
        serviceName: 'app',
        serviceUserId: mockAppId,
      });
    });

    it('Should return a 500 if a condition error occurs when deleting', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
          'requesting-service': 'app',
          'requesting-service-user-id': 'test-user-id',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockAppService}/${mockAppId}`,
        pathParameters: {
          identifier: mockAppId,
          serviceName: mockAppService,
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{identifier}',
      };

      const expectedError = new Error('Database connection failed');
      expectedError.name = 'ConditionalCheckFailedException';

      dynamoMock.on(QueryCommand).resolves({
        Items: [mockAppIdentity],
      });
      dynamoMock.on(DeleteCommand).rejects(expectedError);

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 404,
        errorType: 'IDENTITY_NOT_FOUND',
        errorMessage: 'Identity not found with service: app and id: app123',
        serviceName: mockAppService,
        serviceUserId: mockAppId,
      });
    });

    it('Should return a 500 if theres any unknown error', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
          'requesting-service': 'app',
          'requesting-service-user-id': 'test-user-id',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockAppService}/${mockAppId}`,
        pathParameters: {
          identifier: mockAppId,
          serviceName: mockAppService,
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{identifier}',
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [mockAppIdentity],
      });
      dynamoMock.on(DeleteCommand).rejects(new Error('Failed to save'));

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
