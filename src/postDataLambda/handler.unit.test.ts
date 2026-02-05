/* eslint-disable @typescript-eslint/no-explicit-any */
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
            getByServiceId: mockGetIdentity,
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
process.env['IDENTITY_TABLE_NAME'] = 'identity-table'

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

  const createEvent = (headers, pathParameters, body): APIGatewayProxyEventV2 => ({
    headers: {...headers, 'requesting-service': 'UDP-TEST', 'Content-Type': 'application/json'},
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath: '',
    pathParameters,
    rawQueryString: '',
    version: '2.0',
    routeKey: '$default',
    body: JSON.stringify(body) as any
  }); 

  describe('successful operations', () => {
    it('should return 201 and save entity with valid data', async () => {
      const body = {data: {status: 'active', count: 5}};
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: 'topics'},
        body
      )

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockSave.mockResolvedValue(undefined);

      const response = (await lambdaHandler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual(
        JSON.stringify({ message: 'Entity saved successfully' }),
      );
      expect(mockSave).toHaveBeenCalledWith(mockResolvedIdentity, 'topics', body);
    });

    it('should return 201 and save entity with TTL', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const body = {configuration: {expiryMechanism: 'DELETE', expiresAt: ttl}, data: {status: 'active', count: 5}};
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: 'topics'},
        body
      )

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      mockSave.mockResolvedValue(undefined);

      const response = (await lambdaHandler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual(
        JSON.stringify({ message: 'Entity saved successfully' }),
      );
      expect(mockSave).toHaveBeenCalledWith(mockResolvedIdentity, 'topics', body);
    });

    it('should return 201 and save entity with only pk and sk (no data field)', async () => {
      const body = {data: {}}
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: 'topics'},
        body
      )
      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);
      mockSave.mockResolvedValue(undefined);

      const response = (await lambdaHandler(event, mockContext)) as any;

      expect(response.statusCode).toEqual(201);
      expect(response.body).toEqual(
        JSON.stringify({ message: 'Entity saved successfully' }),
      );
      expect(mockSave).toHaveBeenCalledWith(mockResolvedIdentity, 'topics', body);
    });
  });

  describe('validation errors', () => {
    it('should return 400 when path paremeter is missing', async () => {
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {},
        {data: {status: 'active', count: 5}}
      )

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Validation Failed resourcePath: is required',
      );

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when body is missing', async () => {
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: 'topics'},
        null
      )

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed : Invalid input: expected object, received null');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 415 when body is undefined', async () => {
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: 'topics'},
        undefined
      )

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(415);
      expect(result.body).toBe('Invalid or malformed JSON was provided');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when path is undefined', async () => {
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: undefined},
        {data: {status: 'active', count: 5}}
      )

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed resourcePath: is required');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when header is undefined', async () => {
      const event = createEvent(
        {'requesting-service-user-id': undefined},
        {resourcePath: 'topics'},
        {data: {status: 'active', count: 5}}
      )

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed requesting-service-user-id: is required');

      expect(mockSave).not.toHaveBeenCalled();
    });

    it('should return 400 when header is missing', async () => {
      const event = createEvent(
        {},
        {resourcePath: 'topics'},
        {data: {status: 'active', count: 5}}
      )

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(400);
      expect(result.body).toBe('Validation Failed requesting-service-user-id: is required');

      expect(mockSave).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 when save operation fails', async () => {
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: 'topics'},
        {data: {status: 'active', count: 5}}
      )

      mockGetIdentity.mockResolvedValue(mockResolvedIdentity);

      mockSave.mockRejectedValue(new Error('DynamoDB error'));

      const result = await lambdaHandler(event, mockContext);

      expect(result.statusCode).toBe(500);
      expect(result.body).toBe(JSON.stringify({statusCode: 500, errorType: 'INTERNAL_SERVER_ERROR', errorMessage: 'Internal Server Error'}));
    });

    it('should handle missing required', async () => {
      delete process.env['TABLE_NAME'];
      const event = createEvent(
        {'requesting-service-user-id': 'user-guid-123'},
        {resourcePath: 'topics'},
        {data: {status: 'active', count: 5}}
      )

      const result = await lambdaHandler(event, mockContext);
      expect(result.statusCode).toBe(400);
      expect(result.body).toBe(
        'Missing required environment variables: TABLE_NAME',
      );
    });
  });
});
