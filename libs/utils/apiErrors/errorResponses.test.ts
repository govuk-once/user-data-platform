import createHttpError from 'http-errors';
import { describe, expect, it } from 'vitest';
import {generateErrorResponseFromHttpError} from './errorResponses'

describe('API error responses generator', () => {

    const testCase = [
        {
            code: 400,
            expected: {
                statusCode: 400,
                errorType: 'BadRequestError',
                errorMessage: 'Bad Request Error'
            },
            error: createHttpError.BadRequest('Bad Request Error')
        },
        {
            code: 401,
            expected: {
                statusCode: 401,
                errorType: 'UnauthorizedError',
                errorMessage: 'Unauthorized Error'
            },
            error: createHttpError.Unauthorized('Unauthorized Error')
        },
        {
            code: 403,
            expected: {
                statusCode: 403,
                errorType: 'ForbiddenError',
                errorMessage: 'Forbidden Error'
            },
            error: createHttpError.Forbidden('Forbidden Error')
        },
        {
            code: 404,
            expected: {
                statusCode: 404,
                errorType: 'IDENTITY_NOT_FOUND',
                errorMessage: 'Identity Not Found'
            },
            error: createHttpError.NotFound('Identity Not Found')
        },
        {
            code: 404,
            expected: {
                statusCode: 404,
                errorType: 'DATA_NOT_FOUND',
                errorMessage: 'Data Not Found'
            },
            error: createHttpError.NotFound('Data Not Found')
        },
        {
            code: 500,
            expected: {
                statusCode: 500,
                errorType: 'InternalServerError',
                errorMessage: 'Internal Server Error'
            },
            error: createHttpError.InternalServerError('Internal Server Error')
        },
        {
            code: 418,
            expected: {
                statusCode: 500,
                errorType: 'INTERNAL_SERVER_ERROR',
                errorMessage: 'Internal Server Error'
            },
            error: createHttpError.ImATeapot('Internal Server Error')
        }
    ]

    it.each(testCase)('Testing generateErrorResponseFromHttpError for $code', ({expected, error}) => {
        let response = generateErrorResponseFromHttpError(error);
        expect(response).toStrictEqual(expected);
    })

})