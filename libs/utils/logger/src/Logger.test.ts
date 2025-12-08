import { describe, it, expect, vi, afterEach } from 'vitest';
import { Logger } from '../src/logger';
import { Logger as PowerToolLogger } from '@aws-lambda-powertools/logger';

describe('Logger', () => {
  const serviceName = 'test-service';
  const environment = 'test';

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createLogger = (redact: string[] = []) =>
    new Logger(
      {
        serviceName,
        environment,
      },
      { redact },
    );

  describe('Appends common fields', () => {
    it('logs info with addtional fields', () => {
      const logger = createLogger();
      const infoSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'info')
        .mockImplementation(() => {});

      const fields = {
        username: 'alice',
      };

      logger.info('user login', fields);

      expect(infoSpy).toHaveBeenCalledTimes(1);

      const [, loggedFields] = infoSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        username: 'alice',
        serviceName: 'test-service',
      });
    });
    it('logs error with addtional fields', () => {
      const logger = createLogger();
      const errorSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'error')
        .mockImplementation(() => {});

      const fields = {
        username: 'alice',
      };

      logger.error('user login', fields);

      expect(errorSpy).toHaveBeenCalledTimes(1);

      const [, loggedFields] = errorSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        username: 'alice',
        serviceName: 'test-service',
      });
    });
    it('logs warn with addtional fields', () => {
      const logger = createLogger();
      const warnSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'warn')
        .mockImplementation(() => {});

      const fields = {
        username: 'alice',
      };

      logger.warn('user login', fields);

      expect(warnSpy).toHaveBeenCalledTimes(1);

      const [, loggedFields] = warnSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        username: 'alice',
        serviceName: 'test-service',
      });
    });
    it('logs debug with addtional fields', () => {
      const logger = createLogger();
      const debugSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'debug')
        .mockImplementation(() => {});

      const fields = {
        username: 'alice',
      };

      logger.debug('user login', fields);

      expect(debugSpy).toHaveBeenCalledTimes(1);

      const [, loggedFields] = debugSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        username: 'alice',
        serviceName: 'test-service',
      });
    });
    it('logs trace with addtional fields', () => {
      const logger = createLogger();
      const traceSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'trace')
        .mockImplementation(() => {});

      const fields = {
        username: 'alice',
      };

      logger.trace('user login', fields);

      expect(traceSpy).toHaveBeenCalledTimes(1);

      const [, loggedFields] = traceSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        username: 'alice',
        serviceName: 'test-service',
      });
    });
  });

  describe('redaction', () => {
    it('redacts simple field names at root level', () => {
      const logger = createLogger(['password']);
      const infoSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'info')
        .mockImplementation(() => {});

      const fields = {
        environment: 'test',
        serviceName: 'test-service',
        username: 'alice',
        password: 'super-secret',
      };

      logger.info('user login', fields);

      expect(infoSpy).toHaveBeenCalledTimes(1);

      const [, loggedFields] = infoSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        username: 'alice',
        password: '***REDACTED***',
        serviceName: 'test-service',
      });
      // original object must not be mutated
      expect(fields.password).toBe('super-secret');
    });

    it('redacts nested objects by key name', () => {
      const logger = createLogger(['password']);
      const infoSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'info')
        .mockImplementation(() => {});

      const fields = {
        user: {
          id: '123',
          password: 'nested-secret',
          profile: {
            email: 'test@example.com',
          },
        },
      };

      logger.info('nested user', fields);

      const [, loggedFields] = infoSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        serviceName: 'test-service',
        user: {
          id: '123',
          password: '***REDACTED***',
          profile: {
            email: 'test@example.com',
          },
        },
      });

      // Original untouched
      expect(fields.user.password).toBe('nested-secret');
    });

    it('redacts by dotted path (e.g. "headers.authorization")', () => {
      const logger = createLogger(['authorization']);
      const infoSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'info')
        .mockImplementation(() => {});

      const fields = {
        headers: {
          authorization: 'Bearer token-value',
          'x-correlation-id': 'corr-1',
        },
      };

      logger.info('request with auth', fields);

      const [, loggedFields] = infoSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        serviceName: 'test-service',
        headers: {
          authorization: '***REDACTED***',
          'x-correlation-id': 'corr-1',
        },
      });
    });

    it('redacts fields using regex rules (e.g. /token/i)', () => {
      const logger = createLogger(['accessToken', 'refresh_token', 'token']);
      const infoSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'info')
        .mockImplementation(() => {});

      const fields = {
        token: 'root-token',
        nested: {
          accessToken: 'access-token',
          inner: {
            refresh_token: 'refresh-token',
          },
        },
      };

      logger.info('tokens present', fields);

      const [, loggedFields] = infoSpy.mock.calls[0];

      expect(loggedFields).toEqual({
        environment: 'test',
        serviceName: 'test-service',
        token: '***REDACTED***',
        nested: {
          accessToken: '***REDACTED***',
          inner: {
            refresh_token: '***REDACTED***',
          },
        },
      });
    });

    it('does not modify fields when no redaction rules match', () => {
      const logger = createLogger(['secretField']);
      const infoSpy = vi
        .spyOn(PowerToolLogger.prototype as any, 'info')
        .mockImplementation(() => {});

      const fields = {
        environment: 'test',
        serviceName: 'test-service',
        safe: 'ok',
        other: 123,
      };

      logger.info('no redaction needed', fields);

      const [, loggedFields] = infoSpy.mock.calls[0];

      expect(loggedFields).toEqual(fields);
    });
  });
});
