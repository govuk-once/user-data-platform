/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi } from 'vitest';
import { handler } from './handler';
import { beforeEach } from 'node:test';
import createHttpError from 'http-errors';

process.env['TABLE_NAME'] = 'test-table';

const mockGet = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  ServiceFactory: class {
    getService() {
      return {
        getById: mockGet,
      };
    }
  },
  DynamoDBIdentityService: class {
    getById = mockGet;
  },
  DynamoDBRepository: class {},
}));

describe('readIdentityLambda', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'readIdentityLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:readIdentityLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/readIdentityLambda',
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
    it('Should throw a bad request if the userId is not set in the path params', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{userId}',
        pathParameters: {
          userId: undefined,
        },
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed userId: is required');
    });
  });

  describe('Get', () => {
    it('Should return a 200 if record is found', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/user-guid-123',
        pathParameters: {
          userId: 'test-user-id',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{userId}',
      };

      const record = {
        pk: 'test',
        sk: 'test',
        serviceName: 'app',
        serviceId: '24f2323e32-e232-e23e23-e23e23e23d',
        accessToken: '',
        idToken: '',
        refreshToken: '',
      };

      mockGet.mockResolvedValue(record);

      const result = await handler(event, mockContext);

      expect(mockGet).toHaveBeenCalled();

      expect(result?.statusCode).toBe(200);
      expect(result.body).toEqual(
        JSON.stringify({
          serviceName: 'app',
          serviceId: '24f2323e32-e232-e23e23-e23e23e23d',
          accessToken: '',
          idToken: '',
          refreshToken: '',
        }),
      );
    });

    it('Should return a 404 if app user cannot be found', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/user-guid-123',
        pathParameters: {
          userId: 'test-user-id',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{userId}',
      };

      mockGet.mockRejectedValue(createHttpError.NotFound());

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(404);
    });

    it('Should return a 500 if theres any unknown error', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/user-guid-123',
        pathParameters: {
          userId: 'test-user-id',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{userId}',
      };

      mockGet.mockRejectedValue(Error('Unknown'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
    });
  });
});
