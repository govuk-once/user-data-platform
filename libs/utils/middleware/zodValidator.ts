import type { MiddlewareObj, Request } from '@middy/core';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { z, ZodError } from 'zod';
import { BaseUDPError, UDP_ERROR_TYPES, ZodValidationError } from '../Errors';
import { RouteConfig, routes } from '../schemas';
import { Logger } from '../logger/Logger';

type ResponseSchemaConfig<TResponse> = {
  statusCode: number;
  schema: z.ZodType<TResponse>;
};

export type ZodValidatorOptions<
  TBody = unknown,
  TPath = unknown,
  TQuery = unknown,
  THeader = unknown,
  TResponse = unknown,
> = {
  body?: z.ZodType<TBody>;
  pathParameters?: z.ZodType<TPath>;
  queryStringParameters?: z.ZodType<TQuery>;
  headers?: z.ZodType<THeader>;
  responses?: ResponseSchemaConfig<TResponse>[];
};

type APIGatewayRequest = Request<APIGatewayProxyEventV2, object, Error>;

const formatZodValidationError = (error: ZodError): ZodValidationError => {
  const errorMessage = 'Validation Errors';
  const errorPaths: string[] = [];
  error.issues.map((issue) => {
    const path = issue.path;
    const pathKey = path.join('.');
    errorPaths.push(pathKey);
  });
  return new ZodValidationError(
    errorMessage,
    UDP_ERROR_TYPES.BAD_REQUEST,
    errorPaths,
  );
};

const getValidationSchemas = (lambdaName: string): ZodValidatorOptions => {
  const routeConfig: RouteConfig = routes[lambdaName];
  if (!routeConfig) {
    throw new BaseUDPError(
      `Could not find associated schemas for lambda : ${lambdaName}`,
      UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
    );
  }
  return {
    body: routeConfig.body,
    headers: routeConfig.headers,
    pathParameters: routeConfig.params,
    queryStringParameters: routeConfig.query,
    responses: [
      ...routeConfig.successResponses.map((response) => {
        return {
          statusCode: response.status,
          schema: response.schema,
        };
      }),
      ...routeConfig.errorResponses.map((response) => {
        return {
          statusCode: response.status,
          schema: response.schema,
        };
      }),
    ],
  };
};

export function zodValidator(
  lambdaName: string,
  logger: Logger,
): MiddlewareObj<APIGatewayProxyEventV2> {
  return {
    before: async (request: APIGatewayRequest) => {
      const schemas = getValidationSchemas(lambdaName);
      try {
        if (schemas.pathParameters) {
          request.event.pathParameters = schemas.pathParameters.parse(
            request.event.pathParameters ?? {},
          ) as Record<string, string | undefined>;
        }
        if (schemas.headers) {
          const normalizedHeader: Record<string, string|undefined> = {};
          for(const [key, value] of Object.entries(request.event.headers ?? {}){
            normalizedHeader[key.toLowerCase()] = value
          }
          request.event.headers = schemas.headers.parse(
            normalizedHeader,
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
        logger.error(errorMessage);
        throw new BaseUDPError(
          errorMessage,
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        );
      }
    },
    after: async (request: APIGatewayRequest) => {
      const schemas = getValidationSchemas(lambdaName);
      try {
        if (schemas.responses) {
          const responseStatus = request.response['statusCode'];
          schemas.responses.forEach((schema) => {
            if (responseStatus === schema.statusCode) {
              schema.schema.parse(request.response['body']);
            }
          });
        }
      } catch (error) {
        if (error instanceof ZodError) {
          const formattedError = formatZodValidationError(error);
          logger.error(formattedError.message);
          return;
        }

        const errorMessage = (error as Error).message;
        logger.error(errorMessage);
        throw new BaseUDPError(
          (error as Error).message,
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        );
      }
    },
  };
}
