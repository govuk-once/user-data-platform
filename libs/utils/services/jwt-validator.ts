import {
  APIGatewayAuthorizerResult,
  PolicyDocument,
  Statement,
} from 'aws-lambda';
import { verify } from 'crypto';
import jwt, { JwtPayload, VerifyOptions } from 'jsonwebtoken';
import jwksClient, { SigningKey } from 'jwks-rsa';

export interface CognitoJwtClaims extends JwtPayload {
  client_id: string;
  scope: string;
  token_use: 'access';
  auth_time: number;
  version: number;
}

export interface JwtValidatorConfig {
  issuer: string;
  audience?: string[];
}

export class JwtValidator {
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly issuer: string;
  private readonly audience?: string[];

  constructor(config: JwtValidatorConfig) {
    this.issuer = config.issuer;
    this.audience = config.audience;

    const jwksUri = `${config.issuer}/.well-known/jwks.json`;

    this.jwksClient = jwksClient({
      jwksUri,
      cache: true,
      cacheMaxEntries: 5,
      cacheMaxAge: 600000,
      rateLimit: true,
      jwksRequestsPerMinute: 10,
    });
  }

  async validate(token: string): Promise<CognitoJwtClaims> {
    const decoded = jwt.decode(token, { complete: true });

    if (!decoded || typeof decoded === 'string') {
      throw new Error('Invalid token format');
    }

    const { kid } = decoded.header;

    if (!kid) {
      throw new Error('Token missing key ID (kid)');
    }

    const signingKey = await this.getSigningKey(kid);

    const verifyOptions: VerifyOptions = {
      issuer: this.issuer,
      algorithems: ['RS256'],
    };

    if (this.audience && this.audience.length > 0) {
      VerifyOptions.audience = this.audience as [string, ...string[]];
    }

    const claims = jwt.verify(
      token,
      signingKey,
      verifyOptions,
    ) as CognitoJwtClaims;

    if (claims.token_use !== 'access') {
      throw new Error('Token is not and access token');
    }

    return claims;
  }

  private async getSigningKey(kid: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.jwksClient.getSigningKey(
        kid,
        (err: Error | null, key?: SigningKey) => {
          if (err) {
            reject(new Error('failed to get sigining key'));
            return;
          }
          if (!key) {
            reject(new Error('failed to get sigining key'));
            return;
          }
          const pubicKey = key.getPublicKey();
          resolve(pubicKey);
        },
      );
    });
  }
}

export function extractBearerToken(
  authorizationHeader: string | undefined,
): string {
  if (!authorizationHeader) {
    throw new Error('Missin Authorization header');
  }

  const parts = authorizationHeader.split(' ');

  if (parts.length !== 2 || parts[0].toLowerCase() !== 'bearer') {
    throw new Error('Invalid Authorization header');
  }

  return parts[1];
}

export function parseScopes(scopeString: string): string[] {
  if (!scopeString) {
    return [];
  }
  return scopeString.split(' ').filter((s) => s.length > 0);
}

export function parseMethodArn(methodArn: string): {
  method: string;
  path: string;
} {
  const arnparts = methodArn.split(':');
  const resourceParts = arnparts[5].split('/');

  const method = resourceParts[2] || 'GET';
  const pathParts = resourceParts.slice(3);
  const path = '/' + pathParts.join('/');

  return { method, path };
}

export function methodToAction(method: string): string {
  const upperMethod = method.toUpperCase();

  switch (upperMethod) {
    case 'GET':
    case 'HEAD':
    case 'OPTIONS':
      return 'read';
    case 'POST':
    case 'PUT':
    case 'PATCH':
      return 'write';
    case 'DELETE':
      return 'delete';
    default:
      return 'read';
  }
}

export function extractResourcesFrompath(path: string): string {
  const segments = path.replace(/^\//, '').split('/');

  if (segments.length >= 3 && segments[0] === 'user') {
    return segments[2];
  }

  return segments[0] || 'unknown';
}

export function isAuthorized(
  scopes: string[],
  resourServerIdentifier: string,
  resource: string,
  action: string,
): boolean {
  const requiredScope = `${resourServerIdentifier}/${resource}:${action}`;
  const wildcardResourceScope = `${resourServerIdentifier}/*:${action}`;
  const wildcardActionScope = `${resourServerIdentifier}/${resource}:*`;
  const fullWildcardScope = `${resourServerIdentifier}/*:*`;

  return (
    scopes.includes(requiredScope) ||
    scopes.includes(wildcardActionScope) ||
    scopes.includes(wildcardResourceScope) ||
    scopes.includes(fullWildcardScope)
  );
}

export function generatePolicy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string | number | boolean>,
): APIGatewayAuthorizerResult {
  const policyDocument: PolicyDocument = {
    Version: '2012-10-17',
    Statement: [
      {
        Action: 'execute-api:Invoke',
        Effect: effect,
        Resource: resource,
      } as Statement,
    ],
  };

  const result: APIGatewayAuthorizerResult = {
    principalId,
    policyDocument,
  };

  if (context) {
    result.context = context;
  }

  return result;
}

export function generateWildcardArn(methodArn: string): string {
  const arnParts = methodArn.split(':');
  const apigatewayArn = arnParts.slice(0, 5).join(':');
  const reourceParts = arnParts[5].split('/');
  const apiId = reourceParts[0];
  const stage = reourceParts[1];

  return `${apigatewayArn}:${apiId}/${stage}/*`;
}
