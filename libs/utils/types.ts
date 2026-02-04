import { z } from 'zod';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface SuccessResponse<T> {
  status: number;
  schema: T;
}

export interface RouteConfig<
  TParams extends z.ZodTypeAny = z.ZodTypeAny,
  THeaders extends z.ZodTypeAny = z.ZodTypeAny,
  TBody extends z.ZodTypeAny = z.ZodTypeAny,
  TQuery extends z.ZodTypeAny = z.ZodTypeAny,
  TResponse extends z.ZodTypeAny = z.ZodTypeAny,
> {
  name: string;
  dynamoDbActions?: string[];
  identityTableActions?: string[];
  environmentVariables?: Record<string, string>;
  authorizationScopes?: string[];
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tags: string[];
  params?: TParams;
  headers?: THeaders;
  body?: TBody;
  query?: TQuery;
  response: TResponse;
  successResponses: SuccessResponse<TResponse>[];
}

export type RouteParams<T extends RouteConfig> = T['params'] extends z.ZodAny
  ? z.infer<T['params']>
  : never;

export type RouteBody<T extends RouteConfig> = T['body'] extends z.ZodAny
  ? z.infer<T['body']>
  : never;

export type RouteQuery<T extends RouteConfig> = T['query'] extends z.ZodAny
  ? z.infer<T['query']>
  : never;

export type RouteResponse<T extends RouteConfig> =
  T['response'] extends z.ZodAny ? z.infer<T['response']> : never;
