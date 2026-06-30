import {
  badRequestResponseSchema,
  identityNotFoundResponseSchema,
  internalServerErrorResponseSchema,
} from '../defaults/errors';
import { identityEndpointPathSchema } from '../endpoints/identity/defaults';
import {
  createIdentityRequestSchema,
  createIdentityResponseSchema,
} from '../endpoints/identity/createIdentity';
import {
  createUserRequestSchema,
  CreateUserResponseSchema,
} from '../endpoints/user/createUser';
import type { RouteConfig } from './types';
import { readIdentityResponseSchema } from '../endpoints/identity/readIdentity';
import { deleteIdentityResponseSchema } from '../endpoints/identity/deleteIdentity';
import {
  dataEndpointHeaderSchema,
  dataEndpointNotFoundResponseSchema,
  dataEndpointPathSchema,
} from '../endpoints/data/defaults';
import {
  postDataRequestSchema,
  postDataResponseSchema,
} from '../endpoints/data/postData';
import { getDataResponseSchema } from '../endpoints/data/getData';
import { deleteDataResponseSchema } from '../endpoints/data/deleteData';
import {
  startDsarHeaderSchema,
  startDsarResponseSchema,
} from '../endpoints/sar-dsar/dsar';
import {
  getSarStatusHeaderSchema,
  getSarStatusNotFoundResponseSchema,
  getSarStatusPathSchema,
  getSarStatusResponseSchema,
  startSarHeaderSchema,
  startSarResponseSchema,
} from '../endpoints/sar-dsar/sar';
import { exchangeIdentityQuerySchama } from '../endpoints/identity/exchangeIdentity';
import {
  linkedServicesPathSchema,
  linkedServicesResponseSchema,
} from '../endpoints/identity/linkedServices';
import {
  patchDataRequestSchema,
  patchDataResponseSchema,
} from '../endpoints/data/patchData';

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
    path: '/v1/user',
    summary: 'Create User Record',
    description: 'Create User Record',
    tags: ['user'],
    body: createUserRequestSchema,
    successResponses: [
      {
        status: 204,
        description: 'No Content',
        schema: CreateUserResponseSchema,
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
  exchangeIdentity: {
    name: 'exchangeIdentity',
    dynamoDbActions: [],
    identityTableActions: [
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/v1/identity/exchange',
    summary: 'Exchange Identity Record',
    description:
      'Look up a linked identity record for a different service vai the shared udpId',
    tags: ['identity'],
    headers: dataEndpointHeaderSchema,
    query: exchangeIdentityQuerySchama,
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
    path: '/v1/identity/{serviceName}/{identifier}',
    summary: 'Create Identity Record',
    description: 'Create Identity Record',
    tags: ['identity'],
    params: identityEndpointPathSchema,
    body: createIdentityRequestSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: createIdentityResponseSchema,
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
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
    path: '/v1/identity/{serviceName}/{identifier}',
    summary: 'Delete Identity Record',
    description: 'Delete Identity Record',
    tags: ['identity'],
    params: identityEndpointPathSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: deleteIdentityResponseSchema,
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
  postData: {
    name: 'postData',
    dynamoDbActions: ['dynamodb:PutItem', 'dynamodb:Query'],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/v1/{resourcePath+}',
    summary: 'Create Resource path data Record',
    description: 'Create Resource path data Record',
    tags: ['data'],
    params: dataEndpointPathSchema,
    headers: dataEndpointHeaderSchema,
    body: postDataRequestSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: postDataResponseSchema,
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
  patchData: {
    name: 'patchData',
    dynamoDbActions: [
      'dynamodb:UpdateItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
    ],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/write'],
    method: 'PATCH',
    path: '/v1/{resourcePath+}',
    summary: 'Patch Resource path data Record',
    description: 'Patch Resource path data Record',
    tags: ['data'],
    params: dataEndpointPathSchema,
    headers: dataEndpointHeaderSchema,
    body: patchDataRequestSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: patchDataResponseSchema,
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
  getData: {
    name: 'getData',
    dynamoDbActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/v1/{resourcePath+}',
    summary: 'Read resource path data Record',
    description: 'Read resource path data Record',
    tags: ['data'],
    params: dataEndpointPathSchema,
    headers: dataEndpointHeaderSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: getDataResponseSchema,
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
        schema: dataEndpointNotFoundResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
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
    params: dataEndpointPathSchema,
    headers: dataEndpointHeaderSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: deleteDataResponseSchema,
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
        schema: dataEndpointNotFoundResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
  startDsar: {
    name: 'startDsar',
    dynamoDbActions: [],
    identityTableActions: [],
    queueName: 'dsarQueue',
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/v1/dsar',
    summary: 'Start a DSAR Request',
    description: 'Start a DSAR Request',
    tags: ['DSAR'],
    headers: startDsarHeaderSchema,
    successResponses: [
      {
        status: 202,
        description: 'OK',
        schema: startDsarResponseSchema,
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
  startSar: {
    name: 'startSar',
    dynamoDbActions: [],
    identityTableActions: [],
    queueName: 'sarQueue',
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/v1/sar',
    summary: 'Start a SAR Request',
    description: 'Start a SAR Request',
    tags: ['SAR'],
    headers: startSarHeaderSchema,
    successResponses: [
      {
        status: 202,
        description: 'Accepted',
        schema: startSarResponseSchema,
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
  getSarStatus: {
    name: 'getSarStatus',
    dynamoDbActions: ['dynamodb:GetItem'],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/v1/sar/{sarId}',
    summary: 'Get SAR Status',
    description: 'Get SAR Status and retrieve pre-signed URL',
    tags: ['SAR'],
    params: getSarStatusPathSchema,
    headers: getSarStatusHeaderSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: getSarStatusResponseSchema,
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
        schema: getSarStatusNotFoundResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
  getAllLinkedService: {
    name: 'getAllLinkedService',
    dynamoDbActions: [],
    identityTableActions: ['dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/read'],
    method: 'GET',
    path: '/v1/identity/linked-services/{serviceName}/{serviceId}',
    summary: 'Get All Linked Services',
    description:
      'Returns all service names linked to the same UDP user via the shared udpId',
    tags: ['identity'],
    params: linkedServicesPathSchema,
    successResponses: [
      {
        status: 200,
        description: 'OK',
        schema: linkedServicesResponseSchema,
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

export type Routes = typeof routes;

export type RouteKey = keyof Routes;
