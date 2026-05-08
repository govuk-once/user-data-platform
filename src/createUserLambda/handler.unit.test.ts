/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './handler';

import {
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';

vi.hoisted(() => {
  process.env['TABLE_NAME'] = 'test-table';
  process.env['IDENTITY_TABLE_NAME'] = 'identity-test-table';
});

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-string-uuid4'),
}));
const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('createItentityHandler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'createIdentityLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:createIdentityLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/createIdentityLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    dynamoMock.reset();
    vi.resetAllMocks();
  });

  describe('Create App User', () => {
    const mockAppId = 'app123';
    const mockServiceName = 'app';
    const mockUdpId = 'mock-string-uuid4';
    const mockAppIdentity: IdentityRecordEntity = {
      pk: `app#${mockAppId}`,
      sk: mockUdpId,
      serviceName: 'app',
      serviceId: mockAppId,
      udpId: mockUdpId,
    };

    describe('Validation Errors', () => {
      it('Should throw validation error if the body is empty', async () => {
        const event: APIGatewayProxyEventV2 = {
          headers: {
            'Content-Type': 'application/json',
          },
          requestContext: {} as any,
          isBase64Encoded: false,
          rawPath: '/v1/user',
          rawQueryString: '',
          version: '2.0',
          routeKey: 'POST /v1/user',
          body: JSON.stringify({}) as any,
        };

        const result = await handler(event, mockContext);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toMatchObject({
          errorCode: 400,
          errorType: 'BAD_REQUEST',
          errorMessage: 'Validation Errors',
          errorPaths: ['appId', 'serviceName'],
        });
      });

      it('Should throw validation error if the appId is not set in the body', async () => {
        const event: APIGatewayProxyEventV2 = {
          headers: {
            'Content-Type': 'application/json',
          },
          requestContext: {} as any,
          isBase64Encoded: false,
          rawPath: '/v1/user',
          rawQueryString: '',
          version: '2.0',
          routeKey: 'POST /v1/user',
          body: JSON.stringify({ serviceName: mockServiceName }) as any,
        };

        const result = await handler(event, mockContext);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toMatchObject({
          errorCode: 400,
          errorType: 'BAD_REQUEST',
          errorMessage: 'Validation Errors',
          errorPaths: ['appId'],
        });
      });

      it('Should throw validation error if the serviceName is not set in the body', async () => {
        const event: APIGatewayProxyEventV2 = {
          headers: {
            'Content-Type': 'application/json',
          },
          requestContext: {} as any,
          isBase64Encoded: false,
          rawPath: '/v1/user',
          rawQueryString: '',
          version: '2.0',
          routeKey: 'POST /v1/user',
          body: JSON.stringify({ appId: mockAppId }) as any,
        };

        const result = await handler(event, mockContext);

        expect(result.statusCode).toBe(400);
        expect(JSON.parse(result.body)).toMatchObject({
          errorCode: 400,
          errorType: 'BAD_REQUEST',
          errorMessage: 'Validation Errors',
          errorPaths: ['serviceName'],
        });
      });
    });

    it('Should return a 500 if there is a DB error', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/v1/user',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /v1/user',
        body: JSON.stringify({
          appId: mockAppId,
          serviceName: mockServiceName,
        }) as any,
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(PutCommand).rejects(new Error('DB Failure'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 500,
        errorType: 'INTERNAL_SERVER_ERROR',
        errorMessage: 'Internal Server Error - unexpected error of name: Error',
      });
    });

    it('Should return a 204 if the user already exists', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/v1/user',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /v1/user',
        body: JSON.stringify({
          appId: mockAppId,
          serviceName: mockServiceName,
        }) as any,
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(204);
      expect(JSON.parse(result.body)).toMatchObject({});
    });

    it('Should return a 204 if the user is created', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/v1/user',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /v1/user',
        body: JSON.stringify({
          appId: mockAppId,
          serviceName: mockServiceName,
          
        }) as any,
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [] });
      dynamoMock.on(PutCommand).resolves({});

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(204);
      expect(JSON.parse(result.body)).toMatchObject({});
    });
  });
});
