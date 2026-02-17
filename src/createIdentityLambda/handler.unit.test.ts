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

const dynamoMock = mockClient(DynamoDBDocumentClient);

process.env['TABLE_NAME'] = 'test-table';
process.env['IDENTITY_TABLE_NAME'] = 'identity-table';

describe('createItentityHandler', () => {
  const mockAppId = 'app123';
  const mockUdpId = 'mock-string-uuid4';
  const mockAppIdentity: IdentityRecordEntity = {
    pk: `app#${mockAppId}`,
    sk: mockUdpId,
    serviceName: 'app',
    serviceId: mockAppId,
    udpId: mockUdpId,
  };

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

  describe('Create Identity', () => {
    describe('Validation Errors', () => {
      it('Should throw a bad request if the identifier is not set in the path params', async () => {
        const event: APIGatewayProxyEventV2 = {
          headers: {
            'Content-Type': 'application/json',
          },
          requestContext: {} as any,
          isBase64Encoded: false,
          rawPath: 'v1/identity/service1/test-user-id',
          pathParameters: {},
          rawQueryString: '',
          version: '2.0',
          routeKey: 'POST v1/identity/{serviceName}/{identifier}',
          body: JSON.stringify({
            appId: mockAppId,
          }),
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

      it('Should throw a bad request if the appId is not set in the body', async () => {
        const event: APIGatewayProxyEventV2 = {
          headers: {
            'Content-Type': 'application/json',
          },
          requestContext: {} as any,
          isBase64Encoded: false,
          rawPath: 'v1/identity/service1/test-user-id',
          pathParameters: {
            identifier: 'test-user-id',
            serviceName: 'service1',
          },
          rawQueryString: '',
          version: '2.0',
          routeKey: 'POST v1/identity/{serviceName}/{identifier}',
          body: JSON.stringify({
            serviceName: 'test',
          }),
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
    });

    it('Should return a 500 when the service identifier is equal to the appId', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: 'v1/identity/service1/test-user-id',
        pathParameters: {
          identifier: 'test-user-id',
          serviceName: 'serviceName',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST v1/identity/{serviceName}/{identifier}',
        body: JSON.stringify({
          appId: 'test-user-id',
        }),
      };

      const result = await handler(event, mockContext);

      console.log({ result });
      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 500,
        errorMessage:
          'The provided AppId and ServiceId for linking should not be the same value',
        errorType: 'INTERNAL_SERVER_ERROR',
      });
    });

    it('Should return a 500 if creation fails when the identifier is not the same as appId', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: 'v1/identity/service1/test-user-id',
        pathParameters: {
          identifier: 'test-user-id',
          serviceName: 'serviceName',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST v1/identity/{serviceName}/{identifier}',
        body: JSON.stringify({
          appId: mockAppId,
        }) as any,
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [mockAppIdentity],
      });
      dynamoMock.on(PutCommand).rejects(new Error('Failed to save'));

      const result = await handler(event, mockContext);

      expect(dynamoMock.commandCalls(QueryCommand).length).toEqual(1);
      expect(dynamoMock.commandCalls(PutCommand).length).toEqual(1);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 500,
        errorType: 'INTERNAL_SERVER_ERROR',
        errorMessage: 'Internal Server Error - unexpected error of name: Error',
      });
    });

    it('Should return a 404 if app user cannot be found', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: 'v1/identity/service1/test-user-id',
        pathParameters: {
          identifier: 'test-user-id',
          serviceName: 'serviceName',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST v1/identity/{serviceName}/{identifier}',
        body: JSON.stringify({
          appId: mockAppId,
        }) as any,
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

    it('Should return a 200 when the request is successful', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: 'v1/identity/service1/test-user-id',
        pathParameters: {
          identifier: 'test-user-id',
          serviceName: 'serviceName',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST v1/identity/{serviceName}/{identifier}',
        body: JSON.stringify({
          appId: mockAppId,
        }) as any,
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [mockAppIdentity] });
      dynamoMock.on(PutCommand).resolves({});

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        message: 'Identity successfully created',
      });
    });
  });
});
