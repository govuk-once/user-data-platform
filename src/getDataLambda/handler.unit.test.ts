/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';
import createHttpError from 'http-errors';

const mockGetByKey = vi.fn();
const mockGetIdentity = vi.fn();
// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  ServiceFactory: class {
    getService(type: string) {
      switch (type) {
        case 'identity':
          return {
            getByServiceId: mockGetIdentity,
          };
        case 'data':
          return {
            getByKey: mockGetByKey,
          };
      }
    }
  },
  DynamoDbDataService: class {
    getByKey = mockGetByKey;
  },
  DynamoDBIdentityService: class {
    getById = mockGetIdentity;
  },
  DynamoDBRepository: class {},
  DynamoDBEntity: {},
}));

process.env['TABLE_NAME'] = 'dynamo';
process.env['IDENTITY_TABLE_NAME'] = 'identity-table';

// Import after mocks
const { handler: lambdaHandler } = await import('./handler');

const mockResolvedIdentity: IdentityRecordEntity = {
  pk: 'IDNETITY_RECORD#',
  sk: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  serviceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  serviceName: 'app',
  udpId: 'udp-user-id',
};

describe('getDataLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'getDataLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:getDataLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/getDataLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createEvent = (headers, pathParameters): APIGatewayProxyEventV2 => ({
    headers: { ...headers, 'requesting-service': 'UDP-TEST' },
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath: '',
    pathParameters,
    rawQueryString: '',
    version: '2.0',
    routeKey: '$default',
  });

  describe('successful operations', () => {
    it('should return 200 with entity data when entity is found', async () => {
      const mockEntity = {
        pk: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        sk: 'topics',
        name: 'Test Topic',
      };
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockGetByKey.mockResolvedValue(mockEntity);

      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {
          resourcePath: 'topics',
        },
      );
      const response = await lambdaHandler(event, mockContext);

      expect(mockGetByKey).toHaveBeenCalledWith(mockResolvedIdentity, 'topics');
      expect(response).toEqual({
        body: JSON.stringify({ name: 'Test Topic' }),
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  describe('validation errors', () => {
    it('should return 400 when rawPath is missing', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {},
      );

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed resourcePath: is required');
      expect(mockGetByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when a header is not present', async () => {
      const event = createEvent({}, { resourcePath: 'topics' });

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Validation Failed requesting-service-user-id: is required',
      );
      expect(mockGetByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when a header is invalid', async () => {
      const event = createEvent(
        { 'requesting-service-user-id': 123 },
        { resourcePath: 'topics' },
      );

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Validation Failed requesting-service-user-id: is required',
      );
      expect(mockGetByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when path segments are empty', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        { resourcePath: undefined },
      );

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed resourcePath: is required');
      expect(mockGetByKey).not.toHaveBeenCalled();
    });

    it('should return 404 when Data entity is not found', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {
          resourcePath: 'topics',
        },
      );

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockGetByKey.mockRejectedValue(
        createHttpError.NotFound('Resource Not Found'),
      );

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(result.body).toBe(
        JSON.stringify({
          statusCode: 404,
          errorType: 'DATA_NOT_FOUND',
          errorMessage: `Resource Not Found`,
        }),
      );
      expect(mockGetByKey).toHaveBeenCalledWith(mockResolvedIdentity, 'topics');
    });

    it('should return 404 when identity is not found', async () => {
      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {
          resourcePath: 'topics',
        },
      );

      mockGetIdentity.mockRejectedValue(
        createHttpError.NotFound('Identity Not Found'),
      );
      mockGetByKey.mockResolvedValue(null);

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(result.body).toBe(
        JSON.stringify({
          statusCode: 404,
          errorType: 'IDENTITY_NOT_FOUND',
          errorMessage: `Identity Not Found`,
        }),
      );
      expect(mockGetByKey).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 for unexpected errors', async () => {
      const unexpectedError = new Error('Database connection failed');
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockGetByKey.mockRejectedValue(unexpectedError);

      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {
          resourcePath: 'topics',
        },
      );

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(500);
      expect(mockGetByKey).toHaveBeenCalledWith(mockResolvedIdentity, 'topics');
    });

    it('should re-throw HTTP errors from service', async () => {
      const httpError = new createError.Unauthorized();
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      mockGetByKey.mockRejectedValue(httpError);

      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {
          resourcePath: 'topics',
        },
      );

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(401);
      expect(result.body).toBe(
        '{"statusCode":401,"errorType":"UnauthorizedError","errorMessage":"Unauthorized"}',
      );
      expect(mockGetByKey).toHaveBeenCalledWith(mockResolvedIdentity, 'topics');
    });

    it('should handle missing required', async () => {
      delete process.env['TABLE_NAME'];
      const event = createEvent(
        {
          'requesting-service-user-id': 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
        },
        {
          resourcePath: 'topics',
        },
      );

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Missing required environment variables: TABLE_NAME',
      );
    });
  });
});
