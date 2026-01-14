import { describe, it, expect } from 'vitest';
import {
  extractBearerToken,
  parseScopes,
  methodToAction,
  extractResourcesFrompath,
  isAuthorized,
} from './jwt-validator';

describe('jwt validaotr', () => {
  describe('extractBearerToken', () => {
    it('should extract the token from valid Bearer header', () => {
      const token = extractBearerToken('Bearer abc123');
      expect(token).toBe('abc123');
    });

    it('should be case-insensitive for Bearer prefix', () => {
      const token = extractBearerToken('bearer abc123');
      expect(token).toBe('abc123');
    });

    it('should throw for missing header', () => {
      expect(() => extractBearerToken(undefined)).toThrow(
        'Missing Authorization header',
      );
    });

    it('should throw for Invalid formats', () => {
      expect(() => extractBearerToken('Basic abc123')).toThrow(
        'Invalid Authorization header',
      );
      expect(() => extractBearerToken('Bearer')).toThrow(
        'Invalid Authorization header',
      );
      expect(() => extractBearerToken('abc123')).toThrow(
        'Invalid Authorization header',
      );
    });
  });

  describe('parseScopes', () => {
    it('should parse space-seperated scopes', () => {
      const scopes = parseScopes('api/orders:read api/payments:write');
      expect(scopes).toEqual(['api/orders:read', 'api/payments:write']);
    });

    it('should handle a single scope', () => {
      const scopes = parseScopes('api/orders:read');
      expect(scopes).toEqual(['api/orders:read']);
    });

    it('should handle empty string', () => {
      const scopes = parseScopes('');
      expect(scopes).toEqual([]);
    });

    it('should filter empty segements', () => {
      const scopes = parseScopes('api/orders:read  api/payments:write ');
      expect(scopes).toEqual(['api/orders:read', 'api/payments:write']);
    });
  });

  describe('methodToAction', () => {
    it('should map GET to read', () => {
      expect(methodToAction('GET')).toBe('read');
      expect(methodToAction('get')).toBe('read');
    });

    it('should map HEAD and OPTIONS to read', () => {
      expect(methodToAction('HEAD')).toBe('read');
      expect(methodToAction('OPTIONS')).toBe('read');
    });

    it('should map POST, PUT and PATCH to write', () => {
      expect(methodToAction('POST')).toBe('write');
      expect(methodToAction('PUT')).toBe('write');
      expect(methodToAction('PATCH')).toBe('write');
    });

    it('should map DELETE to delete', () => {
      expect(methodToAction('DELETE')).toBe('delete');
    });

    it('should default to read for unknown methods', () => {
      expect(methodToAction('UNKNOWN')).toBe('read');
    });
  });

  describe('extractResourceFromPath', () => {
    it('should extract resource from /identity/{identifier}/{resource} path', () => {
      expect(extractResourcesFrompath('/identity/123/orders')).toBe('orders');
      expect(extractResourcesFrompath('/identity/abc-456/payments')).toBe(
        'payments',
      );
    });

    it('should handle deeper paths', () => {
      expect(extractResourcesFrompath('/user/123/orders/456/items')).toBe(
        'orders',
      );
    });

    it('should handle without leading slash', () => {
      expect(extractResourcesFrompath('user/123/orders')).toBe('orders');
    });

    it('should return first segment for non-matching paths', () => {
      expect(extractResourcesFrompath('items')).toBe('items');
      expect(extractResourcesFrompath('/api/v1/items')).toBe('api');
    });
  });

  describe('isAuthorized', () => {
    const resourceServerId = 'api';

    it('should authorize exact scope match', () => {
      const scopes = ['api/orders:read'];
      expect(isAuthorized(scopes, resourceServerId, 'orders', 'read')).toBe(
        true,
      );
    });

    it('should deny when the scope is not present', () => {
      const scopes = ['api/orders:read'];
      expect(isAuthorized(scopes, resourceServerId, 'payments', 'read')).toBe(
        false,
      );
    });

    it('should authorize wildcard resource *:action', () => {
      const scopes = ['api/*:read'];
      expect(isAuthorized(scopes, resourceServerId, 'orders', 'read')).toBe(
        true,
      );

      expect(isAuthorized(scopes, resourceServerId, 'orders', 'write')).toBe(
        false,
      );
    });

    it('should authorize wildcard action resource:*', () => {
      const scopes = ['api/orders:*'];
      expect(isAuthorized(scopes, resourceServerId, 'orders', 'read')).toBe(
        true,
      );

      expect(isAuthorized(scopes, resourceServerId, 'items', 'write')).toBe(
        false,
      );
    });

    it('should authorize full wildcard *:*', () => {
      const scopes = ['api/*:*'];
      expect(isAuthorized(scopes, resourceServerId, 'orders', 'read')).toBe(
        true,
      );

      expect(isAuthorized(scopes, resourceServerId, 'items', 'write')).toBe(
        true,
      );
    });
  });
});
