import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi } from 'vitest';
import { handler } from './handler';
import { beforeEach } from 'node:test';
import createHttpError from 'http-errors';
import { Service } from 'aws-cdk-lib/aws-servicediscovery';

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
        rawPath: '/user/user-guid-123',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'GET /user/{userId}',
        body: JSON.stringify({
          data: { status: 'active' },
        }) as any,
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed userId: is required');
    });
  });

  describe('Create', () => {
    it('Should return a 201 if creation is successful when the userId is equal to the appId', async () => {
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
        routeKey: 'GET /user/{userId}',
        body: JSON.stringify({
          appId: 'test-user-id',
          serviceName: 'test',
        }) as any,
      };

      const identityRecord = {
        pk: 'IDENTITY_RECORD#',
        sk: '33f2323e-23e23e-23e23e-23e23e2erff-2323/udp-id',
        serviceId: '33f2323e-23e23e-23e23e-23e23e2erff-2323',
        serviceName: 'app',
        accessToken: 'access_token',
        idToken: 'id_token',
        refreshToken: 'refresh_token',
      };

      mockGet.mockResolvedValue(identityRecord);

      const result = await handler(event, mockContext);

      expect(mockGet).toHaveBeenCalled();

      expect(result?.statusCode).toBe(200);
      expect(result?.body).toEqual(JSON.stringify(identityRecord));
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
        routeKey: 'GET /user/{userId}',
      };

      mockGet.mockRejectedValue(createHttpError.NotFound());

      const result = await handler(event, mockContext);

      console.log({result})

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
        routeKey: 'GET /user/{userId}',
      };

      mockGet.mockRejectedValue(Error('Unknown'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
    });
  });
});
