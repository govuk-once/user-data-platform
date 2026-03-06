/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handler } from './handler';

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';

const dynamoMock = mockClient(DynamoDBDocumentClient);

process.env['TABLE_NAME'] = 'test-table';
process.env['IDENTITY_TABLE_NAME'] = 'identity-table';

const mockAppService = 'app';
const mockRequiredService = 'DVLA';
const mockRequiredId = 'DVLA_1';
const mockAppId = 'app123';
const mockUdpId = 'abc123';
const mockAppIdentity: IdentityRecordEntity = {
  pk: `app#${mockAppId}`,
  sk: mockUdpId,
  serviceName: mockAppService,
  serviceId: mockAppId,
  udpId: mockUdpId,
};

const mockLinkedIdentity: IdentityRecordEntity = {
  pk: `${mockRequiredService}#${mockRequiredId}`,
  sk: mockUdpId,
  serviceName: mockRequiredService,
  serviceId: mockRequiredId,
  udpId: mockUdpId,
};

describe('rechangeIdentityLambda', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'exchangeIdentityLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:exchangeIdentityLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/exchangeIdentityLambda',
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

  describe('Bad Request 400', () => {
    it('Should throw a bad request if the requesting-service header is missing', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        queryStringParameters: {
          requiredService: mockRequiredService,
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/exchange',
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
      });
    });

    it('Should return 400 if requiredService query param is missing', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
          'requesting-service': mockAppService,
          'requesting-service-user-id': mockAppId,
        },
        queryStringParameters: {},
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/exchange',
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 400,
        errorType: 'BAD_REQUEST',
      });
    });
  });

  describe('Successful response', () => {
    it('Should return a 200 with the linked identity record', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
          'requesting-service': mockAppService,
          'requesting-service-user-id': mockAppId,
        },
        queryStringParameters: {
          requiredService: mockRequiredService,
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
        routeKey: 'POST /v1/identity/{serviceName}/{identifier}',
      };

      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [mockAppIdentity] })
        .resolvesOnce({ Items: [mockLinkedIdentity] });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        serviceName: mockRequiredService,
        serviceId: mockRequiredId,
      });
    });
  });

  it('Should return a 404 if identity cannot be found', async () => {
    const event: APIGatewayProxyEventV2 = {
      headers: {
        'Content-Type': 'application/json',
        'requesting-service': mockAppService,
        'requesting-service-user-id': mockAppId,
      },
      queryStringParameters: {
        requiredService: mockRequiredService,
      },
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: '/user/user-guid-123',
      pathParameters: {
        identifier: mockAppId,
        serviceName: mockAppService,
      },
      rawQueryString: '',
      version: '2.0',
      routeKey: 'POST /identity/{identifier}',
    };

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

  it('Should return a 500 if theres any unknown error', async () => {
    const event: APIGatewayProxyEventV2 = {
      headers: {
        'Content-Type': 'application/json',
        'requesting-service': mockAppService,
        'requesting-service-user-id': mockAppId,
      },
      queryStringParameters: {
        requiredService: mockRequiredService,
      },
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: '/user/user-guid-123',
      pathParameters: {
        identifier: 'test-user-id',
        serviceName: 'service1',
      },
      rawQueryString: '',
      version: '2.0',
      routeKey: 'POST /identity/{identifier}',
    };

    dynamoMock.on(QueryCommand).rejects(new Error('DB Failure'));

    const result = await handler(event, mockContext);

    expect(result.statusCode).toBe(500);
    expect(JSON.parse(result.body)).toMatchObject({
      errorCode: 500,
      errorType: 'INTERNAL_SERVER_ERROR',
      errorMessage: 'Internal Server Error - unexpected error of name: Error',
    });
  });
});
