/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';

const mockGetByKey = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  DynamoDbClient: class {
    getService() {
      return {
        getByKey: mockGetByKey,
      };
    }
  },
  DynamoDbService: class {
    getByKey = mockGetByKey;
  },
  DynamoDBRepository: class {},
  DynamoDBEntity: {},
}));

process.env['TABLE_NAME'] = 'dynamo';

// Import after mocks
const { handler: lambdaHandler } = await import('./handler');

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

  const createEvent = (rawPath: string): APIGatewayProxyEventV2 => ({
    headers: {},
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath,
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
      mockGetByKey.mockResolvedValue(mockEntity);

      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      const response = await lambdaHandler(event, mockContext);

      expect(mockGetByKey).toHaveBeenCalledWith(
        'topics',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
      expect(response).toEqual({
        body: JSON.stringify(mockEntity),
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  describe('path parsing', () => {
    it('should extract pk and sk from path with multiple segments', async () => {
      const mockEntity = { pk: 'org456', sk: 'config', data: 'test' };
      mockGetByKey.mockResolvedValue(mockEntity);

      const event = createEvent('/api/v1/organizations/org456/config');
      const response = await lambdaHandler(event, mockContext);

      expect(mockGetByKey).toHaveBeenCalledWith('org456', 'config');
      expect(response).toEqual({
        body: JSON.stringify(mockEntity),
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('should extract pk and sk from simple two-segment path', async () => {
      const mockEntity = { pk: 'pk1', sk: 'sk1', value: 'data' };
      mockGetByKey.mockResolvedValue(mockEntity);

      const event = createEvent('/pk1/sk1');
      const response = await lambdaHandler(event, mockContext);

      expect(mockGetByKey).toHaveBeenCalledWith('pk1', 'sk1');
      expect(response).toEqual({
        body: JSON.stringify(mockEntity),
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  describe('validation errors', () => {
    it('should return 400 when rawPath is missing', async () => {
      const event = createEvent('');

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Path is required');
      expect(mockGetByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when path has less than 2 segments', async () => {
      const event = createEvent('/topics');

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Invalid path format. Expected at least two path segments for pk and sk',
      );
      expect(mockGetByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when path segments are empty', async () => {
      const event = createEvent('///');

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Invalid path format. Expected at least two path segments for pk and sk',
      );
      expect(mockGetByKey).not.toHaveBeenCalled();
    });

    it('should return 404 when entity is not found', async () => {
      mockGetByKey.mockResolvedValue(null);

      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(404);
      expect(result.body).toBe('Not Found');
      expect(mockGetByKey).toHaveBeenCalledWith(
        'topics',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
    });
  });

  describe('error handling', () => {
    it('should return 500 for unexpected errors', async () => {
      const unexpectedError = new Error('Database connection failed');
      mockGetByKey.mockRejectedValue(unexpectedError);

      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(500);
      expect(mockGetByKey).toHaveBeenCalledWith(
        'topics',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
    });

    it('should re-throw HTTP errors from service', async () => {
      const httpError = new createError.Unauthorized();
      mockGetByKey.mockRejectedValue(httpError);

      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(401);
      expect(result.body).toBe('Unauthorized');
      expect(mockGetByKey).toHaveBeenCalledWith(
        'topics',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
    });

    it('should handle missing required', async () => {
      delete process.env['TABLE_NAME'];
      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Missing required environment variables: TABLE_NAME',
      );
    });
  });
});
