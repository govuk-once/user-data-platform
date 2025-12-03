import { describe, it, expect } from 'vitest';
import { extractCompositeKey } from './pathParser';

describe('pathParser', () => {
  describe('extractCompositeKey', () => {
    describe('successful extraction', () => {
      it('should extract pk and sk from valid path with two segments', () => {
        const result = extractCompositeKey('/user#123/profile#456');
        
        expect(result).toEqual({
          pk: 'user#123',
          sk: 'profile#456'
        });
      });

      it('should extract pk and sk from path with multiple segments', () => {
        const result = extractCompositeKey('/api/v1/users/user#123/profile#456');
        
        expect(result).toEqual({
          pk: 'user#123',
          sk: 'profile#456'
        });
      });

      it('should decode URL-encoded characters in pk and sk', () => {
        const result = extractCompositeKey('/user%23123/profile%23456');
        
        expect(result).toEqual({
          pk: 'user#123',
          sk: 'profile#456'
        });
      });

      it('should handle complex encoded values', () => {
        const result = extractCompositeKey('/user%20name%40test/data%2Fvalue');
        
        expect(result).toEqual({
          pk: 'user name@test',
          sk: 'data/value'
        });
      });
    });

    describe('validation errors', () => {
      it('should throw 400 error when path is undefined', () => {
        expect(() => extractCompositeKey(undefined)).toThrow('Path is required');
      });

      it('should throw 400 error when path is empty string', () => {
        expect(() => extractCompositeKey('')).toThrow('Path is required');
      });

      it('should throw 400 error when path has only one segment', () => {
        expect(() => extractCompositeKey('/user#123')).toThrow(
          'Invalid path format. Expected at least two path segments for pk and sk'
        );
      });

      it('should throw 400 error when path has only slashes', () => {
        expect(() => extractCompositeKey('///')).toThrow(
          'Invalid path format. Expected at least two path segments for pk and sk'
        );
      });

      it('should throw 400 error when decoded pk is empty', () => {
        expect(() => extractCompositeKey('/%20/profile#456')).toThrow(
          'Both partition key (pk) and sort key (sk) are required'
        );
      });

      it('should throw 400 error when decoded sk is empty', () => {
        expect(() => extractCompositeKey('/user#123/%20')).toThrow(
          'Both partition key (pk) and sort key (sk) are required'
        );
      });
    });

    describe('edge cases', () => {
      it('should handle path with trailing slash', () => {
        const result = extractCompositeKey('/user#123/profile#456/');
        
        expect(result).toEqual({
          pk: 'user#123',
          sk: 'profile#456'
        });
      });

      it('should handle path with special characters', () => {
        const result = extractCompositeKey('/org#abc-123/item#xyz_789');
        
        expect(result).toEqual({
          pk: 'org#abc-123',
          sk: 'item#xyz_789'
        });
      });
    });
  });
});
