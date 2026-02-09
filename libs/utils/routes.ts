import {
  CreateDataRequestSchema,
  CreateDataResponseSchema,
  DataHeaderSchema,
  DataPathSchema,
  DataResponseSchema,
  DeleteDataResponseSchema,
} from './schemas/data';

import {
  CreateIdentityRequestSchema,
  CreateIdentityResponseSchema,
  CreateUserResponseSchema,
  DeleteIdentityResponseSchema,
  IdentityPathSchema,
  IdentityResponseSchema,
  CreateUserSchema,
} from './schemas/identity';

import type { RouteConfig } from './types';

export * from './types';

export const routes: Record<string, RouteConfig> = {
  createUser: {
    name: 'createUser',
    dynamoDbActions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    identityTableActions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/user',
    summary: 'Create User Record',
    description: 'Create User Record',
    tags: ['user'],
    body: CreateUserSchema,
    response: CreateUserResponseSchema,
    successResponses: [
      {
        status: 201,
        schema: CreateUserResponseSchema,
      },
      {
        status: 201,
        schema: CreateUserResponseSchema,
      },
    ],
  },
  createIdentity: {
    name: 'createIdentity',
    dynamoDbActions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    identityTableActions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/identity/{serviceName}/{identifier}',
    summary: 'Create Identity Record',
    description: 'Create Identity Record',
    tags: ['identity'],
    params: IdentityPathSchema,
    body: CreateIdentityRequestSchema,
    response: CreateIdentityResponseSchema,
    successResponses: [
      {
        status: 201,
        schema: CreateIdentityResponseSchema,
      },
    ],
  },
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
    path: '/identity/{serviceName}/{identifier}',
    summary: 'Read Identity Record',
    description: 'Read Identity Record',
    tags: ['identity'],
    params: IdentityPathSchema,
    response: IdentityResponseSchema,
    successResponses: [
      {
        status: 200,
        schema: IdentityResponseSchema,
      },
    ],
  },
  deleteIdentity: {
    name: 'deleteIdentity',
    dynamoDbActions: ['dynamodb:DeleteItem', 'dynamodb:Query'],
    identityTableActions: [
      'dynamodb:DeleteItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    authorizationScopes: ['udp/delete'],
    method: 'DELETE',
    path: '/identity/{serviceName}/{identifier}',
    summary: 'Delete Identity Record',
    description: 'Delete Identity Record',
    tags: ['identity'],
    params: IdentityPathSchema,
    response: DeleteIdentityResponseSchema,
    successResponses: [
      {
        status: 200,
        schema: DeleteIdentityResponseSchema,
      },
    ],
  },
  createData: {
    name: 'postData',
    dynamoDbActions: ['dynamodb:PutItem', 'dynamodb:Query'],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/v1/{resourcePath+}',
    summary: 'Create Resource path data Record',
    description: 'Create Resource path data Record',
    tags: ['data'],
    params: DataPathSchema,
    headers: DataHeaderSchema,
    body: CreateDataRequestSchema,
    response: CreateDataResponseSchema,
    successResponses: [
      {
        status: 201,
        schema: CreateDataResponseSchema,
      },
    ],
  },
  readData: {
    name: 'getData',
    dynamoDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/v1/{resourcePath+}',
    summary: 'Read resource path data Record',
    description: 'Read resource path data Record',
    tags: ['data'],
    params: DataPathSchema,
    headers: DataHeaderSchema,
    response: DataResponseSchema,
    successResponses: [
      {
        status: 200,
        schema: DataResponseSchema,
      },
    ],
  },
  deleteData: {
    name: 'deleteData',
    dynamoDbActions: ['dynamodb:DeleteItem', 'dynamodb:Query'],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/delete'],
    method: 'DELETE',
    path: '/v1/{resourcePath+}',
    summary: 'Delete resource path Record',
    description: 'Delete resource path Record',
    tags: ['data'],
    params: DataPathSchema,
    headers: DataHeaderSchema,
    response: DeleteDataResponseSchema,
    successResponses: [
      {
        status: 200,
        schema: DeleteDataResponseSchema,
      },
    ],
  },
} as const satisfies Record<string, RouteConfig>;

export type Routes = typeof routes;

export type RouteKey = keyof Routes;
