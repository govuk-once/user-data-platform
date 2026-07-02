/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { handler } from './handler';

import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';

vi.hoisted(() => {
  process.env['TABLE_NAME'] = 'test-table';
  process.env['IDENTITY_TABLE_NAME'] = 'identity-table';
});

const dynamoMock = mockClient(DynamoDBDocumentClient);

const mockServiceName = 'app';
const mockServiceId = 'app-id';
const mockUdpId = 'udp-id-123';

const mockBaseIdentity: IdentityRecordEntity = {
  pk: `${mockServiceName}#${mockServiceId}`,
  sk: mockUdpId,
  serviceName: mockServiceName,
  serviceId: mockServiceId,
  udpId: mockUdpId,
};

const mockIdentities: IdentityRecordEntity[] = [
  {
    pk: `app#app-id`,
    sk: mockUdpId,
    serviceName: 'app',
    serviceId: 'app-id',
    udpId: mockUdpId,
  },
  {
    pk: `dwp#dwp-id`,
    sk: mockUdpId,
    serviceName: 'dwp',
    serviceId: 'dwp-id',
    udpId: mockUdpId,
  },
];

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'getAllLinkedServiceLambda',
  functionVersion: '1',
  invokedFunctionArn:
    'arn:aws:lambda:us-east-1:123456789012:function:getAllLinkedServiceLambda',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/getAllLinkedServiceLambda',
  logStreamName: 'test-stream',
  getRemainingTimeInMillis: () => 5000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

describe('getAllLinkedServiceLambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    vi.resetAllMocks();
  });

  describe('400 Bad Request', () => {
    it('should return 400 if serviceName path param is missing', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: { 'Content-Type': 'application/json' },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/v1/identity/linked-services',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'GET /v1/identity/{serviceName}/{identifier}/linked-services',
        pathParameters: {
          serviceName: undefined,
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

  describe('200 Success', () => {
    it('should return 200 with an array of linked service names', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: { 'Content-Type': 'application/json' },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockServiceName}/${mockServiceId}/linked-services`,
        rawQueryString: '',
        version: '2.0',
        routeKey: 'GET /v1/identity/{serviceName}/{identifier}/linked-services',
        pathParameters: {
          serviceName: mockServiceName,
          identifier: mockServiceId,
        },
      };

      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [mockBaseIdentity] })
        .resolvesOnce({ Items: mockIdentities });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        linkedServices: ['app', 'dwp'],
      });
    });

    it('should return 200 with an empty array when no linked services exist', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: { 'Content-Type': 'application/json' },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockServiceName}/${mockServiceId}/linked-services`,
        rawQueryString: '',
        version: '2.0',
        routeKey: 'GET /v1/identity/{serviceName}/{identifier}/linked-services',
        pathParameters: {
          serviceName: mockServiceName,
          identifier: mockServiceId,
        },
      };

      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [mockBaseIdentity] })
        .resolvesOnce({ Items: [] });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toMatchObject({
        linkedServices: [],
      });
    });
  });

  describe('404 Not Found', () => {
    it('should return 404 if the identity does not exist', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: { 'Content-Type': 'application/json' },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockServiceName}/${mockServiceId}/linked-services`,
        rawQueryString: '',
        version: '2.0',
        routeKey: 'GET /v1/identity/{serviceName}/{identifier}/linked-services',
        pathParameters: {
          serviceName: mockServiceName,
          identifier: mockServiceId,
        },
      };

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(JSON.parse(result.body)).toMatchObject({
        errorCode: 404,
        errorType: 'IDENTITY_NOT_FOUND',
        errorMessage: `Identity not found with service: ${mockServiceName} and id: ${mockServiceId}`,
        serviceName: mockServiceName,
      });
    });
  });

  describe('500 Internal Server Error', () => {
    it('should return 500 on unexpected DB error', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: { 'Content-Type': 'application/json' },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: `/v1/identity/${mockServiceName}/${mockServiceId}/linked-services`,
        rawQueryString: '',
        version: '2.0',
        routeKey: 'GET /v1/identity/{serviceName}/{identifier}/linked-services',
        pathParameters: {
          serviceName: mockServiceName,
          identifier: mockServiceId,
        },
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
});
