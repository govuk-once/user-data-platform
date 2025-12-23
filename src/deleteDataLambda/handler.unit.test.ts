import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import createError from 'http-errors';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';
import createHttpError from 'http-errors';

const mockDeleteByKey = vi.fn();

const mockSave = vi.fn();
const mockGetIdentity = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  ServiceFactory: class {
    getService(type: string) {
      switch (type) {
        case 'identity':
          return {
            getById: mockGetIdentity,
          };
        case 'data':
          return {
            deleteByKey: mockDeleteByKey,
          };
      }
    }
  },
  DynamoDbDataService: class {
    deleteByKey = mockDeleteByKey;
  },
  DynamoDBIdentityService: class {
    getById = mockGetIdentity;
  },
  DynamoDBRepository: class {},
  DynamoDBEntity: {},
}));

const mockResolvedIdentity: IdentityRecordEntity = {
  pk: 'IDNETITY_RECORD#',
  sk: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  serviceId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
  serviceName: 'app',
  udpId: 'udp-user-id',
};

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

  const createEvent = (pathParams?: any): APIGatewayProxyEventV2 => ({
    headers: {},
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath: '',
    pathParameters: pathParams ?? { userId: 'test-user', proxy: 'topics' },
    rawQueryString: '',
    version: '2.0',
    routeKey: '$default',
  });

  describe('successful operations', () => {
    it('should return 200 when successfully deleted', async () => {
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockDeleteByKey.mockResolvedValue('success');

      const event = createEvent();
      const response = await lambdaHandler(event, mockContext);

      expect(mockDeleteByKey).toHaveBeenCalledWith(
        mockResolvedIdentity,
        'topics',
      );
      expect(response).toEqual({
        body: JSON.stringify({ message: 'Entity deleted successfully' }),
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });
  });

  describe('validation errors', () => {
    it('should return 400 when rawPath is missing', async () => {
      const event = createEvent({ userId: 'test-user-id' });

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed proxy: is required');
      expect(mockDeleteByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when path has less than 2 segments', async () => {
      const event = createEvent({ proxy: 'topics' });

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed userId: is required');
      expect(mockDeleteByKey).not.toHaveBeenCalled();
    });

    it('should return 400 when path segments are empty', async () => {
      const event = createEvent({});

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Validation Failed userId: is required,proxy: is required',
      );
      expect(mockDeleteByKey).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 404 if user is not found', async () => {
      mockGetIdentity.mockRejectedValue(createHttpError.NotFound());
      mockDeleteByKey.mockResolvedValue(undefined);

      const event = createEvent();

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(404);
      expect(mockDeleteByKey).not.toHaveBeenCalledWith(
        mockResolvedIdentity,
        'topics',
      );
    });

    it('should return 404 if user is not found', async () => {
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockDeleteByKey.mockRejectedValue(createHttpError.NotFound());

      const event = createEvent();

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(404);
      expect(mockDeleteByKey).toHaveBeenCalledWith(
        mockResolvedIdentity,
        'topics',
      );
    });

    it('should return 500 for unexpected errors', async () => {
      const unexpectedError = new Error('Database connection failed');
      mockDeleteByKey.mockRejectedValue(unexpectedError);
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      const event = createEvent();

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(500);
      expect(mockDeleteByKey).toHaveBeenCalledWith(
        mockResolvedIdentity,
        'topics',
      );
    });

    it('should re-throw HTTP errors from service', async () => {
      const httpError = new createError.Unauthorized();
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      mockDeleteByKey.mockRejectedValue(httpError);

      const event = createEvent();

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(401);
      expect(result.body).toBe('Unauthorized');
      expect(mockDeleteByKey).toHaveBeenCalledWith(
        mockResolvedIdentity,
        'topics',
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
