import { BaseUDPError, UDP_ERROR_TYPES, ZodValidationError } from '@libs/utils';
import type { MiddlewareObj, Request } from '@middy/core';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z, ZodError } from 'zod';
import { Logger } from '@libs/utils';

export interface ZodValidatorOptions<
  TBody = unknown,
  TPath = unknown,
  TQuery = unknown,
  THeader = unknown,
  TResponse = unknown,
> {
  body?: z.ZodType<TBody>;
  pathParameters?: z.ZodType<TPath>;
  queryStringParameters?: z.ZodType<TQuery>;
  headers?: z.ZodType<THeader>;
  response?: z.ZodType<TResponse>;
}

type APIGatewayRequest = Request<APIGatewayProxyEventV2, object, Error>;

const formatZodValidationError = (error: ZodError): ZodValidationError => {
  let errorMessage = 'Validation Errors: ';
  let errorPaths: string[];
  error.issues.map((issue) => {
    const path = issue.path;
    const pathKey = path.join('.');
    errorMessage.concat(`${pathKey}: ${issue.message}, `);
    errorPaths.push(pathKey);
  });
  return new ZodValidationError(
    errorMessage,
    UDP_ERROR_TYPES.BAD_REQUEST,
    errorPaths,
  );
};

export function zodValidator<
  TBody = unknown,
  TPath = unknown,
  TQuery = unknown,
  THeader = unknown,
  TResponse = unknown,
>(
  schemas: ZodValidatorOptions<TBody, TPath, TQuery, THeader, TResponse>,
  logger: Logger
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
          request.event.headers = schemas.headers.parse(
            request.event.headers,
          ) as Record<string, string | undefined>;
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
          const formattedError = formatZodValidationError(error);
          logger.error(formattedError.message);
          throw formattedError;
        }

        const errorMessage = (error as Error).message;
        logger.error(errorMessage)
        throw new BaseUDPError(
          errorMessage,
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        );
      }
    },
    after: async (request: APIGatewayRequest) => {
      try {
        if (schemas.response) {
          schemas.response.parse(request.response['body']);
        }
      } catch (error) {
        if (error instanceof ZodError) {
          const formattedError = formatZodValidationError(error);
          logger.error(formattedError.message);
          return;
        }

        const errorMessage = (error as Error).message;
        logger.error(errorMessage)
        throw new BaseUDPError(
          (error as Error).message,
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  };
}
