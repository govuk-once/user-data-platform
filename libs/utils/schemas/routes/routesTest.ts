import type { RouteConfig } from './types';
import {
  badRequestResponseSchema,
  identityNotFoundResponseSchema,
  internalServerErrorResponseSchema,
} from '../defaults/errors';
import { identityEndpointPathSchema } from '../endpoints/identity/defaults';
import { readIdentityResponseSchema } from '../endpoints/identity/readIdentity';

export * from './types';

export const routesTest: Record<string, RouteConfig> = {
  readIdentity: {
    name: 'readIdentity',
    dynamoDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    identityTableActions: [
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/v1/identity/{serviceName}/{identifier}',
    summary: 'Read Identity Record',
    description: 'Read Identity Record',
    tags: ['identity'],
    params: identityEndpointPathSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: readIdentityResponseSchema,
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 404,
        description: 'Not Found',
        schema: identityNotFoundResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
} as const satisfies Record<string, RouteConfig>;

export type Routes = typeof routesTest;

export type RouteKey = keyof Routes;
