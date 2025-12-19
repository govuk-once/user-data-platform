import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi } from 'vitest';
import { handler } from './handler';
import { beforeEach } from 'node:test';
import createHttpError from 'http-errors';

process.env['TABLE_NAME'] = 'test-table';

const mockGet = vi.fn();
const mockDelete = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  ServiceFactory: class {
    getService() {
      return {
        getById: mockGet,
        deleteById: mockDelete,
      };
    }
  },
  DynamoDBIdentityService: class {
    getById = mockGet;
    deleteById = mockDelete;
  },
  DynamoDBRepository: class {},
}));

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

  describe('Delete', () => {
    it('Should return a 200 if record is successfuly Deleted', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/test-user-id',
        pathParameters: {
          userId: 'test-user-id',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /user/{userId}',
      };

      mockDelete.mockResolvedValue(true);

      const result = await handler(event, mockContext);

      expect(mockDelete).toHaveBeenCalled();

      expect(result?.statusCode).toBe(200);
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

      mockDelete.mockRejectedValue(createHttpError.NotFound());

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

      mockDelete.mockRejectedValue(Error('Unknown'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
    });
  });
});
