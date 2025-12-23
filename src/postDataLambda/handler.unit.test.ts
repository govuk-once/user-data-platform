import { describe, expect, it, vi, beforeEach } from 'vitest';
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';
import { IdentityRecordEntity } from 'libs/data-access/types/Entity';

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
            save: mockSave,
          };
      }
    }
  },
  DynamoDbDataService: class {
    save = mockSave;
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

// Import after mocks
const { handler: lambdaHandler } = await import('./handler');

process.env['TABLE_NAME'] = 'dynamo';

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
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/topics/user-guid-123',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: 'topics',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: JSON.stringify({ status: 'active', count: 5 }) as any,
      };

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockSave.mockResolvedValue(undefined);

      const response = (await lambdaHandler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual(
        JSON.stringify({ message: 'Entity saved successfully' }),
      );
      expect(mockSave).toHaveBeenCalledWith(mockResolvedIdentity, 'topics', {
        status: 'active',
        count: 5,
      });
    });

    it('should return 201 and save entity with TTL', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user-guid-123/topics',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: 'topics',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: JSON.stringify({
          status: 'active',
          ttl,
        }),
      };
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      mockSave.mockResolvedValue(undefined);

      const response = (await lambdaHandler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual(
        JSON.stringify({ message: 'Entity saved successfully' }),
      );
      expect(mockSave).toHaveBeenCalledWith(mockResolvedIdentity, 'topics', {
        status: 'active',
        ttl,
      });
    });

    it('should return 201 and save entity with only pk and sk (no data field)', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user-guid-123/topics',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: 'topics',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: JSON.stringify({}) as any,
      };
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockSave.mockResolvedValue(undefined);

      const response = (await lambdaHandler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual(
        JSON.stringify({ message: 'Entity saved successfully' }),
      );
      expect(mockSave).toHaveBeenCalledWith(mockResolvedIdentity, 'topics', {
        data: undefined,
        ttl: undefined,
      });
    });
  });

  describe('validation errors', () => {
    it('should return 400 when rawPath is missing', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '',
        pathParameters: {},
        rawQueryString: '',
        version: '2.0',
        routeKey: '',
        body: JSON.stringify({ data: {} }) as any,
      };

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Validation Failed userId: is required,proxy: is required',
      );

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when body is missing', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user-guid-123/topics',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: 'topics',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: null as any,
      };

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Bad Request');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when body is undefined', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user-guid-123/topics',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: 'topics',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: undefined as any,
      };

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(415);
      expect(result.body).toBe('Invalid or malformed JSON was provided');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when path has less than 2 segments', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user-guid-123/topics',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: undefined,
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: '',
        body: JSON.stringify({ data: {} }) as any,
      };

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed proxy: is required');

      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 when save operation fails', async () => {
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user-guid-123/topics',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: 'topics',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: JSON.stringify({
          data: { status: 'active' },
        }) as any,
      };

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      mockSave.mockRejectedValue(new Error('DynamoDB error'));

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBe(undefined);
    });

    it('should handle missing required', async () => {
      delete process.env['TABLE_NAME'];
      const event: APIGatewayProxyEventV2 = {
        headers: {
          'Content-Type': 'application/json',
        },
        requestContext: {} as any,
        isBase64Encoded: false,
        rawPath: '/user-guid-123/topics',
        pathParameters: {
          userId: 'user-guid-123',
          proxy: 'topics',
        },
        rawQueryString: '',
        version: '2.0',
        routeKey: 'POST /topics/{pk}',
        body: JSON.stringify({
          data: { status: 'active' },
        }) as any,
      };

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Missing required environment variables: TABLE_NAME',
      );
    });
  });
});
