import type { MiddlewareObj, Request } from '@middy/core';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createHttpError from 'http-errors';
import { z, ZodError } from 'zod';

export interface ZodValidatorOptions<
  TBody = unknown,
  TPath = unknown,
  TQuery = unknown,
  THeader = unknown,
> {
  body?: z.ZodType<TBody>;
  pathParameters?: z.ZodType<TPath>;
  queryStringParameters?: z.ZodType<TQuery>;
  headers?: z.ZodType<THeader>;
}

type APIGatewayRequest = Request<APIGatewayProxyEventV2, object, Error>;

export function zodValidator<
  TBody = unknown,
  TPath = unknown,
  TQuery = unknown,
  THeader = unknown,
>(
  schemas: ZodValidatorOptions<TBody, TPath, TQuery, THeader>,
): MiddlewareObj<APIGatewayProxyEventV2> {
  return {
    before: async (request: APIGatewayRequest) => {
      try {
        if (schemas.pathParameters) {
          request.event.pathParameters = schemas.pathParameters.parse(
            request.event.pathParameters ?? {},
          ) as Record<string, string | undefined>;
        }
        if (schemas.headers) {
          request.event.headers = schemas.headers.parse(request.event.headers) as Record<string, string | undefined>;
        }
        if (schemas.body) {
          request.event.body = schemas.body.parse(request.event.body) as string;
        }
        if (schemas.queryStringParameters) {
          request.event.queryStringParameters =
            schemas.queryStringParameters.parse(
              request.event.queryStringParameters ?? {},
            ) as Record<string, string | undefined>;
        }
      } catch (error) {
        if (error instanceof ZodError) {
          throw createHttpError.BadRequest(
            `Validation Failed ${error.issues.map((issue) => `${issue.path}: ${issue.message}`)}`,
          );
        }

        throw error;
      }
    },
  };
}
