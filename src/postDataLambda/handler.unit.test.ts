import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const mockSave = vi.fn();

// Mock the data-access library
vi.mock('@libs/data-access', () => ({
  DynamoDbClient: class {
    getService() {
      return {
        save: mockSave,
        getByKey: vi.fn(),
      };
    }
  },
  DynamoDbService: class {
    save = mockSave;
  },
  DynamoDBRepository: class {},
  DynamoDBEntity: {},
}));

// Import after mocks
const { lambdaHandler } = await import('./handler');

describe('postDataLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'postDataLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:postDataLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/postDataLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('successful operations', () => {
    it('should return 201 and save entity with valid data', async () => {
    const event: APIGatewayProxyEventV2 = {
      headers: {},
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: '/topics/user-guid-123',
      rawQueryString: '',
      version: '2.0',
      routeKey: 'POST /topics/{pk}',
      body: {
        data: { status: 'active', count: 5 },
      } as any,
    };

    mockSave.mockResolvedValue(undefined);

    const response = await lambdaHandler(event, mockContext) as any;

    expect(response.statusCode).toEqual(201);
    expect(response.body).toEqual({ message: 'Entity saved successfully' });
    expect(mockSave).toHaveBeenCalledWith({
      pk: 'topics',
      sk: 'user-guid-123',
      data: { status: 'active', count: 5 },
      ttl: undefined,
    });
  });

    it('should return 201 and save entity with TTL', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const event: APIGatewayProxyEventV2 = {
        headers: {},
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/topics/user-guid-123',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: {
          data: { status: 'active' },
          ttl,
        } as any,
      };

      mockSave.mockResolvedValue(undefined);

      const response = await lambdaHandler(event, mockContext) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual({ message: 'Entity saved successfully' });
      expect(mockSave).toHaveBeenCalledWith({
        pk: 'topics',
        sk: 'user-guid-123',
        data: { status: 'active' },
        ttl,
      });
    });

    it('should return 201 and save entity with only pk and sk (no data field)', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {},
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/topics/user-guid-123',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: {} as any,
      };

      mockSave.mockResolvedValue(undefined);

      const response = await lambdaHandler(event, mockContext) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual({ message: 'Entity saved successfully' });
      expect(mockSave).toHaveBeenCalledWith({
        pk: 'topics',
        sk: 'user-guid-123',
        data: undefined,
        ttl: undefined,
      });
    });
  });

  describe('path parsing', () => {
    it('should extract pk and sk from the last two path segments', async () => {
    const event: APIGatewayProxyEventV2 = {
      headers: {},
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: '/api/v1/data/my-partition/my-sort',
      rawQueryString: '',
      version: '2.0',
      routeKey: 'POST /api/v1/data/{pk}/{sk}',
      body: {
        data: { test: 'value' },
      } as any,
    };

    mockSave.mockResolvedValue(undefined);

    await lambdaHandler(event, mockContext);

      expect(mockSave).toHaveBeenCalledWith({
        pk: 'my-partition',
        sk: 'my-sort',
        data: { test: 'value' },
        ttl: undefined,
      });
    });
  });

  describe('validation errors', () => {
    it('should return 400 when rawPath is missing', async () => {
    const event: APIGatewayProxyEventV2 = {
      headers: {},
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: '',
      rawQueryString: '',
      version: '2.0',
      routeKey: '',
      body: { data: {} } as any,
    };

    await expect(lambdaHandler(event, mockContext)).rejects.toThrow();
    expect(mockSave).not.toHaveBeenCalled();
  });

    it('should return 400 when body is missing', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {},
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/topics/user-guid-123',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: null as any,
      };

      await expect(lambdaHandler(event, mockContext)).rejects.toThrow();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when body is undefined', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {},
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/topics/user-guid-123',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: undefined as any,
      };

      await expect(lambdaHandler(event, mockContext)).rejects.toThrow();
      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when path has less than 2 segments', async () => {
    const event: APIGatewayProxyEventV2 = {
      headers: {},
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: '/single-segment',
      rawQueryString: '',
      version: '2.0',
      routeKey: '',
      body: { data: {} } as any,
    };

      await expect(lambdaHandler(event, mockContext)).rejects.toThrow();
      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 when save operation fails', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {},
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/topics/user-guid-123',
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: {
          data: { status: 'active' },
        } as any,
      };

      mockSave.mockRejectedValue(new Error('DynamoDB error'));

      await expect(lambdaHandler(event, mockContext)).rejects.toThrow();
    });
  });
});
