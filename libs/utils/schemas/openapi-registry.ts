import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import {
  getDefaultErrorCodes,
  getErrorResponses,
  SuccessResponseSchema,
} from './';
import type { RouteConfig } from '../types';
import { routes } from '../routes';
import { OpenAPIObject } from '@asteasolutions/zod-to-openapi/dist/types';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description:
    'Oauth JWT token from cognito, obtain by client credentials grant',
});

function registerRoute(route: RouteConfig) {
  //   const successStatus = route.method === 'POST' ? 201 : 200;
  //   const successDescription =

  const params = route.params as any;

  const query = route.query as any;

  const errorCodes = getDefaultErrorCodes({
    hasBody: !!route.body,
    hasParams: !!route.params,
  });

  registry.registerPath({
    method: route.method.toLowerCase() as
      | 'get'
      | 'post'
      | 'delete'
      | 'put'
      | 'patch',
    path: route.path,
    summary: route.summary,
    description: route.description,
    tags: route.tags,
    security: [{ bearerAuth: [] }],
    request: {
      params,
      query,
      body: route.body
        ? {
            content: { 'application/json': { schema: route.body } },
          }
        : undefined,
    },
    responses: {
      [route.successStatus]: {
        description: 'Sucesss',
        content: {
          'application/json': {
            schema: route.response || SuccessResponseSchema,
          },
        },
      },
      ...getErrorResponses(errorCodes),
    },
  });
}

for (const route of Object.values(routes)) {
  registerRoute(route);
}

export function generateOpenApiDocument() {
  const generator = new OpenApiGeneratorV3(registry.definitions);

  const response = generator.generateDocument({
    openapi: '3.0.3',
    info: {
      title: 'User Data platform API',
      version: '1.0.0',
      description: 'Private Api for the User data Platform',
    },
    tags: [
      {
        name: 'identity',
        description: 'Identity Operations',
      },
      {
        name: 'data',
        description: 'Data Operations',
      },
    ],
  });

  return response as unknown as OpenAPIObject
}
