/* eslint-disable @typescript-eslint/no-explicit-any */
import { APIGatewayProxyEventV2, Context } from 'aws-lambda';

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
    it('should return 200 when ServiceFactory initialises and services are created', async () => {
      const response = await handler(createEvent(), mockContext);

      expect(response.statusCode).toEqual(200);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'healthy',
      });
      expect(mockGetService).toHaveBeenCalledWith('data');
      expect(mockGetService).toHaveBeenCalledWith('identity');
    });
  });

  describe('error handling', () => {
    it('should return 500 when getService throws for data service', async () => {
      mockGetService.mockImplementation((name: string) => {
        if (name === 'data') throw new Error('DynamoDB table not found');
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
      });

      const response = await handler(createEvent(), mockContext);

      expect(response.statusCode).toEqual(500);
      expect(JSON.parse(response.body)).toMatchObject({
        status: 'unhealthy',
        error: 'Service creation failed',
      });
    });
  });
});
