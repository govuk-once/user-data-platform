import { describe, it, expect, beforeEach, vi } from 'vitest';
import { logger } from './Logger';

describe('Logger', () => {
  beforeEach(() => {
    // Reset enabled state
    logger.setEnabled(true);
  });

  describe('setEnabled', () => {
    it('should enable logging by default', () => {
      expect(logger.isEnabled()).toBe(true);
    });

    it('should disable logging when set to false', () => {
      logger.setEnabled(false);
      expect(logger.isEnabled()).toBe(false);
    });

    it('should enable logging when set to true', () => {
      logger.setEnabled(false);
      logger.setEnabled(true);
      expect(logger.isEnabled()).toBe(true);
    });
  });

  describe('info', () => {
    it('should log info message when enabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('test message', { key: 'value' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"INFO"'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"test message"'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"key":"value"'),
      );

      consoleSpy.mockRestore();
    });

    it('should not log when disabled', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      logger.setEnabled(false);

      logger.info('test message');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('error', () => {
    it('should log error message when enabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      logger.error('error message', { error: 'details' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"ERROR"'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"error message"'),
      );

      consoleSpy.mockRestore();
    });

    it('should not log when disabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      logger.setEnabled(false);

      logger.error('error message');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('debug', () => {
    it('should log debug message when enabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});

      logger.debug('debug message', { context: 'data' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"level":"DEBUG"'),
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('"message":"debug message"'),
      );

      consoleSpy.mockRestore();
    });

    it('should not log when disabled', () => {
      const consoleSpy = vi
        .spyOn(console, 'debug')
        .mockImplementation(() => {});
      logger.setEnabled(false);

      logger.debug('debug message');

      expect(consoleSpy).not.toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('timestamp', () => {
    it('should include ISO timestamp in logs', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      logger.info('test');

      const logOutput = consoleSpy.mock.calls[0][0];
      const parsed = JSON.parse(logOutput);

      expect(parsed.timestamp).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
      );

      consoleSpy.mockRestore();
    });
  });
});
