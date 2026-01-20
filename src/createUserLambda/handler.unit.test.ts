/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi } from 'vitest';
import { handler } from './handler';
import { beforeEach } from 'node:test';

process.env['TABLE_NAME'] = 'test-table';

const mockSave = vi.fn();
const mockGet = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  ServiceFactory: class {
    getService() {
      return {
        create: mockSave,
        getById: mockGet,
      };
    }
  },
  DynamoDBIdentityService: class {
    create = mockSave;
  },
  DynamoDBRepository: class {},
}));

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
    vi.resetAllMocks();
  });

  describe('Bad Request 400', () => {
    it('Should throw validation error if the appiId is not set in the body', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user',
        body: JSON.stringify({}) as any,
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed appId: is required');
    });
  });

  describe('Create', () => {
    it('Should return a 201 if creation is successful', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user',
        body: JSON.stringify({
          appId: 'test-user-id',
        }) as any,
      };

      mockSave.mockResolvedValue(undefined);

      const result = await handler(event, mockContext);

      expect(mockSave).toHaveBeenCalled();

      expect(result?.statusCode).toBe(201);
    });

    it('Should return a 500 if theres any unknown error', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user',
        body: JSON.stringify({
          appId: 'test-app-id',
        }) as any,
      };

      mockSave.mockRejectedValue(Error('Unknown'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
    });
  });
});
