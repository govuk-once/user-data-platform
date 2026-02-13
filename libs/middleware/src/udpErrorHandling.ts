import {
  BaseUDPError,
  DataRecordNotFoundError,
  IdentityLinkingInvalidIdentitesError,
  IdentityRecordNotFoundError,
  Logger,
  UDP_ERROR_TYPES,
  ZodValidationError,
} from '@libs/utils';
import {
  BadRequestResponse,
  DataNotFoundResponse,
  IdentityNotFoundResponse,
  InternalServerErrorResponse,
} from '@libs/schemas';
import type { MiddlewareObj, Request } from '@middy/core';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

type APIGatewayRequest = Request<APIGatewayProxyEventV2, object, Error>;

export function udpErrorHandling(
  logger: Logger,
): MiddlewareObj<APIGatewayProxyEventV2> {
  return {
    onError: async (request: APIGatewayRequest) => {
      if (request.response !== undefined) {
        return;
      }

      const error = request.error;

      if (error instanceof BaseUDPError) {
        const errorType = error.errorType[error.errorType];
        const errorMessage = error.message;
        const errorCode = 500;

        if (error instanceof ZodValidationError) {
          const responseBody: BadRequestResponse = {
            errorCode: 400,
            errorType,
            errorMessage,
            errorPaths: error.errorPaths,
          };
          request.response = {
            statusCode: 400,
            body: responseBody,
          };
          return;
        }

        if (error instanceof IdentityRecordNotFoundError) {
          const responseBody: IdentityNotFoundResponse = {
            errorCode: 404,
            errorType,
            errorMessage,
            serviceName: error.serviceName,
            serviceUserId: error.serviceUserId,
          };
          request.response = {
            statusCode: 404,
            body: responseBody,
          };
          return;
        }

        if (error instanceof DataRecordNotFoundError) {
          const responseBody: DataNotFoundResponse = {
            errorCode: 404,
            errorType,
            errorMessage,
            serviceName: error.serviceName,
            serviceUserId: error.serviceUserId,
            resourcePath: error.resourcePath,
          };
          request.response = {
            statusCode: 404,
            body: responseBody,
          };
          return;
        }

        const responseBody: InternalServerErrorResponse = {
          errorCode,
          errorMessage,
          errorType,
        };
        request.response = {
          statusCode: 500,
          body: responseBody,
        };
        return;
      }

      logger.error((error as Error).message);
      const responseBody: InternalServerErrorResponse = {
        errorCode: 500,
        errorMessage: `Internal Server Error - unexpected error of name: ${(error as Error).name}`,
        errorType: UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
      };
      request.response = {
        statusCode: 500,
        body: responseBody,
      };
      return;
    },
  };
}
