import { vi, beforeEach, describe, afterEach, it, expect } from 'vitest';
import middy from '@middy/core';
import {
  createEnvValidator,
  envValidator,
  getValidatedEnv,
  RequestWithEnv,
} from './envValidator';
import { APIGatewayProxyResult, Context } from 'aws-lambda';
import { MissingEnvironmentVariablesError, UDP_ERROR_TYPES } from '../Errors';
import { Logger } from '../logger/Logger';

const createMockContext = (): Context => ({
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'test',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:us-west-1',
  memoryLimitInMB: '128',
  awsRequestId: 'test-request-id',
  logGroupName: 'test',
  logStreamName: 'test',
  getRemainingTimeInMillis: () => 5000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
});

describe('env validator middleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('required variables', () => {
    it('should passs when all required variables are present', async () => {
      process.env['TABLE_NAME'] = 'test-table';
      process.env['KMS_KEY_ID'] = 'kms-id';

      const handler = middy(async () => ({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })).use(envValidator({ required: ['TABLE_NAME', 'KMS_KEY_ID'] }));

      const result = await handler({}, createMockContext());

      expect(result.statusCode).toBe(200);
    });

    it('should throw and EnvironmentConfigurationError when a variable is missing', async () => {
      process.env['TABLE_NAME'] = 'test-table';
      delete process.env['KMS_KEY_ID'];

      const handler = middy(async () => ({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })).use(envValidator({ required: ['TABLE_NAME', 'KMS_KEY_ID'] }));

      const expectedError = new MissingEnvironmentVariablesError(
        `Missing required environment variables: KMS_KEY_ID`,
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        ['KMS_KEY_ID'],
      );
      await expect(handler({}, createMockContext())).rejects.toThrow(
        expectedError,
      );
    });

    it('should throw and EnvironmentConfigurationError when a variable is an empty string', async () => {
      process.env['TABLE_NAME'] = '';

      const handler = middy(async () => ({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })).use(envValidator({ required: ['TABLE_NAME', 'KMS_KEY_ID'] }));

      const expectedError = new MissingEnvironmentVariablesError(
        `Missing required environment variables: TABLE_NAME, KMS_KEY_ID`,
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        ['TABLE_NAME', 'KMS_KEY_ID'],
      );
      await expect(handler({}, createMockContext())).rejects.toThrow(
        expectedError,
      );
    });

    it('should collect all missing variables by defualt', async () => {
      delete process.env['VAR1'];
      delete process.env['VAR2'];
      delete process.env['VAR3'];

      const handler = middy(async () => ({
        statusCode: 200,
        body: JSON.stringify({ success: true }),
      })).use(envValidator({ required: ['VAR1', 'VAR2', 'VAR3'] }));

      try {
        await handler({}, createMockContext());
        expect.fail('should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(MissingEnvironmentVariablesError);
        const configError = error as MissingEnvironmentVariablesError;
        expect(configError.message).toEqual(
          'Missing required environment variables: VAR1, VAR2, VAR3',
        );
      }
    });

    it('Should throw if no required or optional variables provided', () => {
      expect(() => envValidator({})).toThrow(
        'envValidator requires at least one required or optional environment variable',
      );
    });

    it('Should throw if no required or optional are both  empty', () => {
      expect(() => envValidator({ required: [], optional: {} })).toThrow(
        'envValidator requires at least one required or optional environment variable',
      );
    });
  });

  describe('optional variables', () => {
    it('should use default value when optional variable is missing', async () => {
      delete process.env['LOG_LEVEL'];

      const middleware = envValidator({
        optional: { LOG_LEVEL: 'info' },
      });

      const mockRequest = {
        event: {},
        context: createMockContext(),
        response: null,
        error: null,
        internal: {},
      };

      await middleware.before!(
        mockRequest as Parameters<NonNullable<typeof middleware.before>>[0],
      );

      const env = getValidatedEnv(mockRequest as unknown as RequestWithEnv);
      expect(env.get('LOG_LEVEL')).toBe('info');
    });

    it('should use default if optional variable is an empty string', async () => {
      process.env['LOG_LEVEL'] = '';

      const middleware = envValidator({
        optional: { LOG_LEVEL: 'warn' },
      });

      const mockRequest = {
        event: {},
        context: createMockContext(),
        response: null,
        error: null,
        internal: {},
      };

      await middleware.before!(
        mockRequest as Parameters<NonNullable<typeof middleware.before>>[0],
      );

      const env = getValidatedEnv(mockRequest as unknown as RequestWithEnv);
      expect(env.get('LOG_LEVEL')).toBe('warn');
    });

    it('should use actual value if it is set', async () => {
      process.env['LOG_LEVEL'] = 'error';

      const middleware = envValidator({
        optional: { LOG_LEVEL: 'warn' },
      });

      const mockRequest = {
        event: {},
        context: createMockContext(),
        response: null,
        error: null,
        internal: {},
      };

      await middleware.before!(
        mockRequest as Parameters<NonNullable<typeof middleware.before>>[0],
      );

      const env = getValidatedEnv(mockRequest as unknown as RequestWithEnv);
      expect(env.get('LOG_LEVEL')).toBe('error');
    });
  });

  describe('mixed required and optional', () => {
    it('should validate and provide defaults for optional', async () => {
      process.env['REQUIRED_VAR'] = 'required';
      delete process.env['OPTIONAL_VAR'];

      const middleware = envValidator({
        required: ['REQUIRED_VAR'],
        optional: { OPTIONAL_VAR: 'default' },
      });

      const mockRequest = {
        event: {},
        context: createMockContext(),
        response: null,
        error: null,
        internal: {},
      };

      await middleware.before!(
        mockRequest as Parameters<NonNullable<typeof middleware.before>>[0],
      );

      const env = getValidatedEnv(mockRequest as unknown as RequestWithEnv);
      expect(env.get('REQUIRED_VAR')).toBe('required');
      expect(env.get('OPTIONAL_VAR')).toBe('default');
    });

    it('should include  both required and optional in getAll', async () => {
      process.env['REQ'] = 'req';
      process.env['OPT'] = 'opt';

      const middleware = envValidator({
        required: ['REQ'],
        optional: { OPT: 'default' },
      });

      const mockRequest = {
        event: {},
        context: createMockContext(),
        response: null,
        error: null,
        internal: {},
      };

      await middleware.before!(
        mockRequest as Parameters<NonNullable<typeof middleware.before>>[0],
      );

      const env = getValidatedEnv(mockRequest as unknown as RequestWithEnv);
      expect(env.getAll()).toEqual({
        REQ: 'req',
        OPT: 'opt',
      });
    });
  });

  describe('logging', () => {
    it('should use custom logger when provided', async () => {
      delete process.env['MISSING'];

      const mockLogger = new Logger(
        { environment: 'development', serviceName: 'Update' },
        {},
      );

      const mockSpy = vi
        .spyOn(mockLogger, 'error')
        .mockImplementation(() => {});

      const handler = middy(
        async (): Promise<APIGatewayProxyResult> => ({
          statusCode: 200,
          body: JSON.stringify({ success: true }),
        }),
      ).use(envValidator({ required: ['MISSING'], logger: mockLogger }));

      await expect(handler({}, createMockContext())).rejects.toThrow();
      expect(mockSpy).toHaveBeenCalledWith(
        'Missing required environment variables: MISSING',
      );
    });

    it('should use console logger by default', async () => {
      delete process.env['MISSING'];

      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      const handler = middy(
        async (): Promise<APIGatewayProxyResult> => ({
          statusCode: 200,
          body: JSON.stringify({ success: true }),
        }),
      ).use(envValidator({ required: ['MISSING'] }));

      await expect(handler({}, createMockContext())).rejects.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(
        'Missing required environment variables: MISSING',
      );
    });
  });

  describe('getValidatedEnv', () => {
    it('should throw when accessing non-calidated variables', async () => {
      process.env['TABLE_NAME'] = 'table';

      const middleware = envValidator({ required: ['TABLE_NAME'] });
      const mockRequest = {
        event: {},
        context: createMockContext(),
        response: null,
        error: null,
        internal: {},
      };

      await middleware.before!(
        mockRequest as Parameters<NonNullable<typeof middleware.before>>[0],
      );

      const env = getValidatedEnv(mockRequest as unknown as RequestWithEnv);
      expect(env.get('TABLE_NAME')).toBe('table');
      expect(() => env.get('UNKNOEN')).toThrow();
    });

    it('should throw if the middleware is not run', async () => {
      const mockRequest = {
        event: {},
        context: createMockContext(),
        response: null,
        error: null,
        internal: {},
      };

      expect(() =>
        getValidatedEnv(mockRequest as unknown as RequestWithEnv),
      ).toThrow();
    });

    it('should throw if getEnv called before middleware', () => {
      const { getEnv } = createEnvValidator({ required: ['TEST'] });

      expect(() => getEnv()).toThrow(
        'getEnv() called before middleware executed',
      );
    });
  });

  describe('createEnvValidator', () => {
    it('should provide type-safe access to required variables', async () => {
      process.env['DATABASE'] = 'postgress://localhost';
      process.env['API_KEY'] = 'secret'; // pragma: allowlist secret

      const { middleware, getEnv } = createEnvValidator({
        required: ['DATABASE', 'API_KEY'] as const,
        optional: { OPTIONAL: 'default' },
      });

      const handler = middy(async (): Promise<APIGatewayProxyResult> => {
        const env = getEnv();
        return {
          statusCode: 200,
          body: JSON.stringify({
            dbURl: env.DATABASE,
            apiKey: env.API_KEY,
            optional: env.OPTIONAL,
          }),
        };
      }).use(middleware);

      const result = await handler({}, createMockContext());
      const body = JSON.parse(result.body);

      expect(body.dbURl).toBe('postgress://localhost');
      expect(body.apiKey).toBe('secret');
      expect(body.optional).toBe('default');
    });
  });
});
