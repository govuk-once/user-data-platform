import {
  OpenApiGeneratorV3,
  OpenAPIRegistry,
} from '@asteasolutions/zod-to-openapi';
import type { RouteConfig } from '../routes/types';
import { routes } from '../routes/routes';
import { OpenAPIObject } from '@asteasolutions/zod-to-openapi/dist/types';
import { RouteParameter } from '@asteasolutions/zod-to-openapi/dist/openapi-registry';
import { version } from '../../../package.json';

export const registry = new OpenAPIRegistry();

registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  description:
    'Oauth JWT token from cognito, obtain by client credentials grant',
});

function registerRoute(route: RouteConfig) {
  const params = route.params as unknown as RouteParameter;
  const query = route.query as unknown as RouteParameter;
  const headers = route.headers as unknown as RouteParameter;

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
      headers: headers,
      body: route.body
        ? {
            content: { 'application/json': { schema: route.body } },
          }
        : undefined,
    },
    responses: {
      ...Object.fromEntries(
        route.successResponses.map((resp) => [
          resp.status,
          {
            description: resp.description,
            content: {
              'application/json': {
                schema: resp.schema,
              },
            },
          },
        ]),
      ),
      ...Object.fromEntries(
        route.errorResponses.map((resp) => [
          resp.status,
          {
            description: resp.description,
            content: {
              'application/json': {
                schema: resp.schema,
              },
            },
          },
        ]),
      ),
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
      version,
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

  return response as unknown as OpenAPIObject;
}
