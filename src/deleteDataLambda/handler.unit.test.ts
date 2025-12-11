import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';

const mockDeleteByKey = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  DynamoDbClient: class {
    getService() {
      return {
        deleteByKey: mockDeleteByKey,
      };
    }
  },
  DynamoDbService: class {
    deleteByKey = mockDeleteByKey;
  },
  DynamoDBRepository: class {},
  DynamoDBEntity: {},
}));

process.env['TABLE_NAME'] = 'dynamo';

// Import after mocks
const { handler: lambdaHandler } = await import('./handler');

describe('deleteDataLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'getDataLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:deleteDataLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/deleteDataLambda',
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
    it('should return 200 when successfully deleted', async () => {
    
      mockDeleteByKey.mockResolvedValue('success');

      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');
      const response = await lambdaHandler(event, mockContext);

      expect(mockDeleteByKey).toHaveBeenCalledWith(
        'topics',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
      expect(response).toEqual({
        body: JSON.stringify({ message: 'Entity deleted successfully' }),
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  describe('path parsing', () => {
    it('should extract pk and sk from path with multiple segments', async () => {
      mockDeleteByKey.mockResolvedValue('success');

      const event = createEvent('/api/v1/organizations/org456/config');
      const response = await lambdaHandler(event, mockContext);

      expect(mockDeleteByKey).toHaveBeenCalledWith('org456', 'config');
      expect(response).toEqual({
        body: JSON.stringify({ message: 'Entity deleted successfully' }),
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    it('should extract pk and sk from simple two-segment path', async () => {
      mockDeleteByKey.mockResolvedValue('success');

      const event = createEvent('/pk1/sk1');
      const response = await lambdaHandler(event, mockContext);

      expect(mockDeleteByKey).toHaveBeenCalledWith('pk1', 'sk1');
      expect(response).toEqual({
        body: JSON.stringify({ message: 'Entity deleted successfully' }),
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
      expect(mockDeleteByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when path has less than 2 segments', async () => {
      const event = createEvent('/topics');

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Invalid path format. Expected at least two path segments for pk and sk',
      );
      expect(mockDeleteByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when path segments are empty', async () => {
      const event = createEvent('///');

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Invalid path format. Expected at least two path segments for pk and sk',
      );
      expect(mockDeleteByKey).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 for unexpected errors', async () => {
      const unexpectedError = new Error('Database connection failed');
      mockDeleteByKey.mockRejectedValue(unexpectedError);

      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(500);
      expect(mockDeleteByKey).toHaveBeenCalledWith(
        'topics',
        'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
      );
    });

    it('should re-throw HTTP errors from service', async () => {
      const httpError = new createError.Unauthorized();
      mockDeleteByKey.mockRejectedValue(httpError);

      const event = createEvent('/topics/a1b2c3d4-e5f6-7890-abcd-ef1234567890');

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(401);
      expect(result.body).toBe('Unauthorized');
      expect(mockDeleteByKey).toHaveBeenCalledWith(
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
