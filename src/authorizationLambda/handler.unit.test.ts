import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { APIGatewayTokenAuthorizerEvent, Statement } from 'aws-lambda';

vi.hoisted(() => {
  ((process.env['COGNITO_ISSUER'] =
    'https://cognito-idp.eu-west-1.amazonaws.com/eu-west-1_test'),
    (process.env['RESEOURCE_SERVER_ID'] = 'api'));
});

const getStatment = (statement: Statement) =>
  statement as Statement & { Effect: string; Resource: string; Action: string };

const mockValidate = vi.hoisted(() => vi.fn());
const mockExtractBearerToken = vi.hoisted(() => vi.fn());
const mockParseScopes = vi.hoisted(() => vi.fn());
const mockMethodtoAction = vi.hoisted(() => vi.fn());
const mockExtractResourceFromPath = vi.hoisted(() => vi.fn());
const mockIsAuthorized = vi.hoisted(() => vi.fn());
const mockParseMethodArn = vi.hoisted(() => vi.fn());

vi.mock('@libs/utils', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...(actual as unknown as any),
    JwtValidator: class JwtValidator {
      validate = mockValidate;
    },
    extractBearerToken: mockExtractBearerToken,
    parseScopes: mockParseScopes,
    methodToAction: mockMethodtoAction,
    extractResourcesFrompath: mockExtractResourceFromPath,
    parseMethodArn: mockParseMethodArn,
    isAuthorized: mockIsAuthorized,
  };
});

import { handler } from './handler';

const createMockEvent = (
  overrides: Partial<APIGatewayTokenAuthorizerEvent> = {},
): APIGatewayTokenAuthorizerEvent => ({
  type: 'TOKEN',
  authorizationToken: 'Bearer test-token',
  methodArn: 'arn:aws:execute-api:eu-west-1:123456789:api-id/dev/GET/topics',
  ...overrides,
});

describe('authorizer handler', () => {
  beforeEach(() => {
    vi.resetAllMocks();

    mockExtractBearerToken.mockReturnValue('test-token');
    mockParseScopes.mockReturnValue(['api/topics:read']);
    mockMethodtoAction.mockReturnValue('read');
    mockExtractResourceFromPath.mockReturnValue('topics');
    mockParseMethodArn.mockRejectedValue('GET');
  });

  describe('successful authentication', () => {
    it('should reutrn Allow policy when authorized', async () => {
      mockValidate.mockReturnValue({
        client_id: 'test-client',
        scope: 'api/topics:read',
      });

      mockIsAuthorized.mockReturnValue(true);

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.principalId).toBe('test-client');
      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect(result.context).toEqual({
        clientId: 'test-client',
        scopes: 'api/topics:read',
        resource: 'topics',
        action: 'read',
      });
    });

    it('should use wildcard Arn for Allow policy (caching)', async () => {
      mockValidate.mockResolvedValue({
        client_id: 'test-client',
        scope: 'api/topics:read',
      });

      mockIsAuthorized.mockResolvedValue(true);
      const event = createMockEvent();
      const result = await handler(event);

      expect(getStatment(result.policyDocument.Statement[0]).Resource).toBe(
        'arn:aws:execute-api:eu-west-1:123456789:api-id/dev/*',
      );
    });

    it('should handle POST mapping to write action', async () => {
      mockValidate.mockResolvedValue({
        client_id: 'test-client',
        scope: 'api/topics:read',
      });
      mockMethodtoAction.mockReturnValue('write');
      mockIsAuthorized.mockResolvedValue(true);

      const event = createMockEvent({
        methodArn:
          'arn:aws:execute-api:eu-west-1:123456789:api-id/dev/POST/topics',
      });
      const result = await handler(event);

      expect(result.policyDocument.Statement[0].Effect).toBe('Allow');
      expect(result.context?.action).toBe('write');
    });
  });

  describe('authorization denied', () => {
    it('should return Deny policy when the scopes are insufficient', async () => {
      mockValidate.mockResolvedValue({
        client_id: 'test-client',
        scope: 'api/topics:read',
      });

      mockIsAuthorized.mockReturnValue(false);

      const event = createMockEvent();
      const result = await handler(event);

      expect(result.principalId).toBe('test-client');
      expect(result.policyDocument.Statement[0].Effect).toBe('Deny');
      expect(getStatment(result.policyDocument.Statement[0]).Resource).toBe(
        event.methodArn,
      );
      expect(result.context).toBeUndefined();
    });
  });
});
