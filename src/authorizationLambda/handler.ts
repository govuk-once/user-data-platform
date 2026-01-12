import {
  APIGatewayAuthorizerResult,
  APIGatewayTokenAuthorizerEvent,
} from 'aws-lambda';
import {
  extractBearerToken,
  extractResourcesFrompath,
  generatePolicy,
  generateWildcardArn,
  isAuthorized,
  JwtValidator,
  methodToAction,
  parseMethodArn,
  parseScopes,
} from '@libs/utils';

const COGNITO_ISSUER = process.env['COGNITO_ISSUER'];
const RESOURCE_SERVER_ID = process.env['RESOURCE_SERVER_ID'] || 'api';

let jwtValidator: JwtValidator | null = null;

function getValidator() {
  if (!jwtValidator) {
    if (!COGNITO_ISSUER) {
      throw new Error('COGNITO_ISSUER enviroment variable is required');
    }
    jwtValidator = new JwtValidator({ issuer: COGNITO_ISSUER });
  }

  return jwtValidator;
}

export const handler = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  const token = extractBearerToken(event.authorizationToken);

  const validator = getValidator();
  const claims = await validator.validate(token);

  const scopes = parseScopes(claims.scope);
  const { method, path } = parseMethodArn(event.methodArn);

  const resource = extractResourcesFrompath(path);
  const action = methodToAction(method);

  const authorized = isAuthorized(scopes, RESOURCE_SERVER_ID, resource, action);

  if (!authorized) {
    return generatePolicy(
      claims.client_id || 'unknown',
      'Deny',
      event.methodArn,
    );
  }

  return generatePolicy(
    claims.client_id || 'user',
    'Allow',
    generateWildcardArn(event.methodArn),
    {
      clientid: claims.client_id || '',
      scopes: scopes.join(','),
      resource,
      action,
    },
  );
};
