import type { MiddlewareObj, Request } from '@middy/core';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import { Logger } from '../logger/Logger';
import {
  BaseUDPError,
  DataRecordNotFoundError,
  IdentityRecordNotFoundError,
  OutOfSequenceError,
  SarNotFoundError,
  ZodValidationError,
} from '../Errors';
import {
  BadRequestResponse,
  ConflictResponse,
  DataNotFoundResponse,
  IdentityNotFoundResponse,
  InternalServerErrorResponse,
  SarNotFoundResponse,
} from '../schemas';

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
        const errorMessage = error.message;
        const errorCode = 500;

        if (error instanceof ZodValidationError) {
          const responseBody: BadRequestResponse = {
            errorCode: 400,
            errorMessage,
            errorPaths: error.errorPaths,
            errorType: 'BAD_REQUEST',
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
            errorMessage,
            serviceName: error.serviceName,
            serviceUserId: error.serviceUserId,
            errorType: 'IDENTITY_NOT_FOUND',
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
            errorMessage,
            serviceName: error.serviceName,
            serviceUserId: error.serviceUserId,
            resourcePath: error.resourcePath,
            errorType: 'DATA_NOT_FOUND',
          };
          request.response = {
            statusCode: 404,
            body: responseBody,
          };
          return;
        }

        if (error instanceof OutOfSequenceError) {
          const responseBody: ConflictResponse = {
            errorCode: 409,
            errorMessage,
            errorType: 'CONFLICT',
            lastUpdated: error.lastUpdated,
            requestedAt: error.requestedAt,
          };
          request.response = {
            statusCode: 409,
            body: responseBody,
          };
          return;
        }

        if (error instanceof SarNotFoundError) {
          const responseBody: SarNotFoundResponse = {
            errorCode: 404,
            errorMessage,
            sarId: error.sarId || '',
            errorType: 'SAR_NOT_FOUND',
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
          errorType: 'INTERNAL_SERVER_ERROR',
        };
        request.response = {
          statusCode: 500,
          body: responseBody,
        };
        return;
      }

      logger.error(error.message);
      const responseBody: InternalServerErrorResponse = {
        errorCode: 500,
        errorMessage: `Internal Server Error - unexpected error of name: ${error.name}`,
        errorType: 'INTERNAL_SERVER_ERROR',
      };
      request.response = {
        statusCode: 500,
        body: responseBody,
      };
    },
  };
}
