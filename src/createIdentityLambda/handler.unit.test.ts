/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { describe, it, expect, vi } from 'vitest';
import { handler } from './handler';
import { beforeEach } from 'node:test';
import createHttpError from 'http-errors';

process.env['TABLE_NAME'] = 'test-table';
process.env['IDENTITY_TABLE_NAME'] = 'identity-table';

const mockSave = vi.fn();
const mockLink = vi.fn();
const mockGet = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  ServiceFactory: class {
    getService() {
      return {
        linkIdentity: mockLink,
        create: mockSave,
        getById: mockGet,
      };
    }
  },
  DynamoDBIdentityService: class {
    link = mockLink;
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
    it('Should throw a bad request if the identifier is not set in the path params', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/user-guid-123',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/{identifier}',
        body: JSON.stringify({
          data: { status: 'active' },
        }) as any,
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Validation Failed identifier: is required,serviceName: is required',
      );
    });

    it('Should throw a bad request if the appId is not set in the body', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
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
        body: JSON.stringify({
          serviceName: 'test',
        }) as any,
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Validation Failed appId: Invalid input: expected string, received undefined',
      );
    });

    it('Should throw a bad request if the appId is not set in the body', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/user-guid-123',
        pathParameters: {
          identifier: 'test-user-id',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/{identifier}',
        body: JSON.stringify({
          appId: 'test',
        }) as any,
      };

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed serviceName: is required');
    });
  });

  describe('Create', () => {
    it('Should return a 201 if creation is successful when the identifier is equal to the appId', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/user-guid-123',
        pathParameters: {
          identifier: 'test-user-id',
          serviceName: 'serviceName',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/{identifier}',
        body: JSON.stringify({
          appId: 'test-user-id',
          serviceName: 'test',
        }) as any,
      };

      mockLink.mockResolvedValue(undefined);

      const result = await handler(event, mockContext);

      expect(mockLink).toHaveBeenCalled();

      expect(result?.statusCode).toBe(201);
    });

    it('Should return a 201 if creation is successful when the identifier is not the same as appId', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user/user-guid-123',
        pathParameters: {
          identifier: 'test-user-id',
          serviceName: 'serviceName',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/{identifier}',
        body: JSON.stringify({
          appId: 'test-app-id',
          serviceName: 'test',
        }) as any,
      };

      mockLink.mockResolvedValue(undefined);

      const result = await handler(event, mockContext);

      expect(mockLink).toHaveBeenCalled();

      expect(result?.statusCode).toBe(201);
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
          identifier: 'test-user-id',
          serviceName: 'serviceName',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/{identifier}',
        body: JSON.stringify({
          appId: 'test-app-id',
          serviceName: 'test',
        }) as any,
      };

      mockLink.mockRejectedValue(createHttpError.NotFound());

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
          identifier: 'test-user-id',
          serviceName: 'service1',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /identity/{identifier}',
        body: JSON.stringify({
          appId: 'test-app-id',
          serviceName: 'test',
        }) as any,
      };

      mockLink.mockRejectedValue(Error('Unknown'));

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
    });
  });
});
