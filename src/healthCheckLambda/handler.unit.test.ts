/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

const mockCheckHealthData = vi.fn();
const mockCheckHealthIdentity = vi.fn();
const mockGetService = vi.hoisted(() => vi.fn());

vi.hoisted(() => {
  process.env['TABLE_NAME'] = 'test-table';
  process.env['IDENTITY_TABLE_NAME'] = 'identity-table';
});

vi.mock('@libs/data-access', () => ({
  ServiceFactory: class {
    getService = mockGetService;
  },
}));

import { handler } from './handler';

describe('healthCheckLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'healthCheckLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:healthCheckLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/healthCheckLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations: both health checks return true
    mockCheckHealthData.mockResolvedValue(true);
    mockCheckHealthIdentity.mockResolvedValue(true);

    mockGetService.mockImplementation((serviceName: string) => {
      if (serviceName === 'data') {
        return { checkHealth: mockCheckHealthData };
      }
      if (serviceName === 'identity') {
        return { checkHealth: mockCheckHealthIdentity };
      }
      return undefined;
    });
  });

  const createEvent = (): APIGatewayProxyEventV2 => ({
    headers: {},
    requestContext: {} as any,
    isBase64Encoded: false,
    rawPath: '',
    rawQueryString: '',
    version: '2.0',
    routeKey: '$default',
  });

  describe('successful operations', () => {
    it('should return 200 when ServiceFactory initialises and services are healthy', async () => {
      const response = await handler(createEvent(), mockContext);

      expect(response.statusCode).toEqual(200);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'healthy',
      });
      expect(mockGetService).toHaveBeenCalledWith('data');
      expect(mockGetService).toHaveBeenCalledWith('identity');
      expect(mockCheckHealthData).toHaveBeenCalled();
      expect(mockCheckHealthIdentity).toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should return 500 when getService throws for data service', async () => {
      mockGetService.mockImplementation((name: string) => {
        if (name === 'data') throw new Error('DynamoDB table not found');
        return { checkHealth: mockCheckHealthIdentity };
      });

      const response = await handler(createEvent(), mockContext);

      expect(response.statusCode).toEqual(500);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'unhealthy',
        error: 'Service creation failed',
      });
    });

    it('should return 500 when getService throws for identity service', async () => {
      mockGetService.mockImplementation((name: string) => {
        if (name === 'identity') throw new Error('Identity table not found');
        return { checkHealth: mockCheckHealthData };
      });

      const response = await handler(createEvent(), mockContext);

      expect(response.statusCode).toEqual(500);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'unhealthy',
        error: 'Service creation failed',
      });
    });

    it('should return 500 when data table health check returns false', async () => {
      mockCheckHealthData.mockResolvedValue(false);

      const response = await handler(createEvent(), mockContext);

      expect(response.statusCode).toEqual(500);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'unhealthy',
        details: {
          dataTable: 'unhealthy',
          identityTable: 'healthy',
        },
      });
    });

    it('should return 500 when identity table health check returns false', async () => {
      mockCheckHealthIdentity.mockResolvedValue(false);

      const response = await handler(createEvent(), mockContext);

      expect(response.statusCode).toEqual(500);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'unhealthy',
        details: {
          dataTable: 'healthy',
          identityTable: 'unhealthy',
        },
      });
    });
  });
});
