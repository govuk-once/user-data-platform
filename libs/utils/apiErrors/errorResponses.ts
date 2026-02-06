import { HttpError } from 'http-errors';

export type APIErrorResponse = {
  statusCode: number;
  errorType: string;
  errorMessage: string;
};

export function generateErrorResponseFromHttpError(
  error: HttpError,
): APIErrorResponse {
  const response = {
    statusCode: 500,
    errorType: 'INTERNAL_SERVER_ERROR',
    errorMessage: 'Internal Server Error',
  };
  switch (error.statusCode) {
    case 404:
      response.statusCode = error.statusCode;
      response.errorType = error.message.startsWith('Identity')
        ? 'IDENTITY_NOT_FOUND'
        : 'DATA_NOT_FOUND';
      response.errorMessage = error.message;
      break;
    case 400:
    case 401:
    case 403:
    case 415:
    case 422:
    case 500:
      response.statusCode = error.statusCode;
      response.errorType = error.name;
      response.errorMessage = error.message;
      break;
    default:
      break;
  }
  return response;
}
