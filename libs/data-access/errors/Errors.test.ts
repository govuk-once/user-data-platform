import { describe, it, expect } from 'vitest';
import { RepositoryError, NotFoundError, SaveError, GetError } from './Errors';

describe('Error Classes', () => {
  describe('RepositoryError', () => {
    it('should create error with custom message', () => {
      const error = new RepositoryError('Custom error message');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RepositoryError);
      expect(error.message).toBe('Custom error message');
      expect(error.name).toBe('RepositoryError');
    });

    it('should have proper prototype chain', () => {
      const error = new RepositoryError('Test');

      expect(error instanceof Error).toBe(true);
      expect(error instanceof RepositoryError).toBe(true);
    });
  });

  describe('NotFoundError', () => {
    it('should create error with entity name and id', () => {
      const error = new NotFoundError('User', '123');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RepositoryError);
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('User with id 123 not found.');
      expect(error.name).toBe('NotFoundError');
    });

    it('should format message correctly with composite key', () => {
      const error = new NotFoundError('item', 'USER#123#PROFILE');

      expect(error.message).toBe('item with id USER#123#PROFILE not found.');
    });

    it('should inherit from RepositoryError', () => {
      const error = new NotFoundError('Product', 'abc');

      expect(error instanceof RepositoryError).toBe(true);
    });
  });

  describe('SaveError', () => {
    it('should create error with entity name, id, and cause', () => {
      const originalError = new Error('Database connection failed');
      const error = new SaveError('User', '456', originalError);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RepositoryError);
      expect(error).toBeInstanceOf(SaveError);
      expect(error.message).toBe(
        'Failed to save User with id 456: Database connection failed',
      );
      expect(error.name).toBe('SaveError');
      expect(error.cause).toBe(originalError);
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('should preserve original error in cause property', () => {
      const originalError = new Error('Write timeout');
      const error = new SaveError('item', 'USER#789#METADATA', originalError);

      expect(error.cause).toBe(originalError);
      expect(error.cause.message).toBe('Write timeout');
    });

    it('should format message correctly with composite key', () => {
      const originalError = new Error('Network error');
      const error = new SaveError('item', 'ORG#123#CONFIG', originalError);

      expect(error.message).toBe(
        'Failed to save item with id ORG#123#CONFIG: Network error',
      );
    });

    it('should inherit from RepositoryError', () => {
      const originalError = new Error('Test');
      const error = new SaveError('Order', '999', originalError);

      expect(error instanceof RepositoryError).toBe(true);
    });

    it('should handle cause that is not an Error instance', () => {
      const originalError = new TypeError('Invalid type');
      const error = new SaveError('User', '123', originalError);

      expect(error.cause).toBe(originalError);
      expect(error.cause).toBeInstanceOf(TypeError);
      expect(error.cause).toBeInstanceOf(Error);
    });
  });

  describe('GetError', () => {
    it('should create error with entity name, id, and cause', () => {
      const originalError = new Error('Connection refused');
      const error = new GetError('User', '789', originalError);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(RepositoryError);
      expect(error).toBeInstanceOf(GetError);
      expect(error.message).toBe(
        'Failed to get User with id 789: Connection refused',
      );
      expect(error.name).toBe('GetError');
      expect(error.cause).toBe(originalError);
      expect(error.cause).toBeInstanceOf(Error);
    });

    it('should preserve original error in cause property', () => {
      const originalError = new Error('Not authorized');
      const error = new GetError('item', 'USER#456#PROFILE', originalError);

      expect(error.cause).toBe(originalError);
      expect(error.cause.message).toBe('Not authorized');
    });

    it('should format message correctly with composite key', () => {
      const originalError = new Error('Table not found');
      const error = new GetError('item', 'PRODUCT#ABC#DETAILS', originalError);

      expect(error.message).toBe(
        'Failed to get item with id PRODUCT#ABC#DETAILS: Table not found',
      );
    });

    it('should inherit from RepositoryError', () => {
      const originalError = new Error('Test');
      const error = new GetError('Customer', '555', originalError);

      expect(error instanceof RepositoryError).toBe(true);
    });

    it('should handle cause that is not an Error instance', () => {
      const originalError = new RangeError('Out of range');
      const error = new GetError('User', '123', originalError);

      expect(error.cause).toBe(originalError);
      expect(error.cause).toBeInstanceOf(RangeError);
      expect(error.cause).toBeInstanceOf(Error);
    });
  });

  describe('Error inheritance chain', () => {
    it('should maintain proper inheritance for all error types', () => {
      const baseError = new RepositoryError('Base');
      const notFoundError = new NotFoundError('User', '1');
      const saveError = new SaveError('User', '2', new Error('test'));
      const getByIdError = new GetError('User', '3', new Error('test'));

      // All should be instances of Error
      expect(baseError instanceof Error).toBe(true);
      expect(notFoundError instanceof Error).toBe(true);
      expect(saveError instanceof Error).toBe(true);
      expect(getByIdError instanceof Error).toBe(true);

      // All except base should be instances of RepositoryError
      expect(baseError instanceof RepositoryError).toBe(true);
      expect(notFoundError instanceof RepositoryError).toBe(true);
      expect(saveError instanceof RepositoryError).toBe(true);
      expect(getByIdError instanceof RepositoryError).toBe(true);

      // Each should be instance of its own type
      expect(notFoundError instanceof NotFoundError).toBe(true);
      expect(saveError instanceof SaveError).toBe(true);
      expect(getByIdError instanceof GetError).toBe(true);

      // Cross-type checks should fail
      expect(notFoundError instanceof SaveError).toBe(false);
      expect(saveError instanceof GetError).toBe(false);
      expect(getByIdError instanceof NotFoundError).toBe(false);
    });
  });
});
