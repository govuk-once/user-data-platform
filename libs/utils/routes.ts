import {
  CreateDataRequestSchema,
  CreateDataResponseSchema,
  DataPathSchema,
  DataResponseSchema,
  DeleteDataResponseSchema,
} from './schemas/data';

import {
  CreateIdentityRequestSchema,
  CreateIdentityResponseSchema,
  DeleteIdentityResponseSchema,
  IdentityPathSchema,
  IdentityResponseSchema,
} from './schemas/identity';

import type { RouteConfig } from './types';

export * from './types';

export const routes = {
  createIdentity: {
    name: 'createIdentity',
    dynamoDbActions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/identity/{identifier}',
    summary: 'Create Identity Record',
    description: 'Create Identity Record',
    tags: ['identity'],
    params: IdentityPathSchema,
    body: CreateIdentityRequestSchema,
    response: CreateIdentityResponseSchema,
    successStatus: 201,
  },
  readIdentity: {
    name: 'readIdentity',
    dynamoDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/identity/{identifier}',
    summary: 'Read Identity Record',
    description: 'Read Identity Record',
    tags: ['identity'],
    params: IdentityPathSchema,
    response: IdentityResponseSchema,
    successStatus: 200,
  },
  deleteIdentity: {
    name: 'deleteIdentity',
    dynamoDbActions: ['dynamodb:DeleteItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/delete'],
    method: 'DELETE',
    path: '/identity/{identifier}',
    summary: 'Delete Identity Record',
    description: 'Delete Identity Record',
    tags: ['identity'],
    successStatus: 200,
    params: IdentityPathSchema,
    response: DeleteIdentityResponseSchema,
  },
  createData: {
    name: 'postData',
    dynamoDbActions: ['dynamodb:PutItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/identity/{identifier}/{proxy+}',
    summary: 'Create Resource path data Record',
    description: 'Create Resource path data Record',
    tags: ['data'],
    params: DataPathSchema,
    body: CreateDataRequestSchema,
    response: CreateDataResponseSchema,
    successStatus: 201,
  },
  readData: {
    name: 'getData',
    dynamoDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/identity/{identifier}/{proxy+}',
    summary: 'Read resource path data Record',
    description: 'Read resource path data Record',
    tags: ['data'],
    successStatus: 200,
    params: DataPathSchema,
    response: DataResponseSchema,
  },
  deleteData: {
    name: 'deleteData',
    dynamoDbActions: ['dynamodb:DeleteItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/delete'],
    method: 'DELETE',
    path: '/identity/{identifier}/{proxy+}',
    summary: 'Delete resource path Record',
    description: 'Delete resource path Record',
    tags: ['data'],
    successStatus: 200,
    params: DataPathSchema,
    response: DeleteDataResponseSchema,
  },
} as const satisfies Record<string, RouteConfig>;

export type Routes = typeof routes;

export type RouteKey = keyof Routes;
