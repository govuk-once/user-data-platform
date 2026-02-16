import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export const badRequestResponseSchema = z.object({
  errorCode: z
    .literal(400)
    .openapi({ description: 'Bad Request Code', example: 400 }),
  errorType: z
    .literal('BAD_REQUEST')
    .openapi({ description: 'Bad Request Type', example: 'BAD_REQUEST' }),
  errorMessage: z.string().openapi({
    description: 'The error message',
    example: 'Request invalid on fields: headers.requesting-service',
  }),
  errorPaths: z.array(z.string()).openapi({
    description: 'Array of failing fields',
    example: ['headers.requesting-service', 'body.configuration'],
  }),
});

export const unauthorizedResponseSchema = z.object({
  errorCode: z
    .literal(401)
    .openapi({ description: 'Unauthorized Code', example: 401 }),
  errorType: z
    .literal('UNAUTHORIZED')
    .openapi({ description: 'Unauthorized Type', example: 'UNAUTHORIZED' }),
});

export const forbiddenResponseSchema = z.object({
  errorCode: z
    .literal(400)
    .openapi({ description: 'Forbidden Code', example: 403 }),
  errorType: z
    .literal('FORBIDDEN')
    .openapi({ description: 'Forbidden Type', example: 'FORBIDDEN' }),
});

const baseNotFoundResponseSchema = z.object({
  errorCode: z
    .literal(404)
    .openapi({ description: 'Bad Request Code', example: 400 }),
  errorMessage: z.string().openapi({
    description: 'The error message',
    example: 'Record not found',
  }),
});

export const identityNotFoundResponseSchema = baseNotFoundResponseSchema.extend(
  {
    errorType: z.literal('IDENTITY_NOT_FOUND').openapi({
      description: 'Identity Not Found Type',
      example: 'IDENTITY_NOT_FOUND',
    }),
    serviceName: z
      .string()
      .openapi({ description: 'Provided service name', example: 'app' }),
    serviceUserId: z.string().openapi({
      description: 'Provided service user Id',
      example: 'fb94de2f-ea1d-4f0f-8b1a-a2d1ca7c0fda',
    }),
  },
);

export const dataNotFoundResponseSchema = baseNotFoundResponseSchema.extend({
  errorType: z
    .literal('DATA_NOT_FOUND')
    .openapi({ description: 'Data Not Found Type', example: 'DATA_NOT_FOUND' }),
  serviceName: z
    .string()
    .openapi({ description: 'Provided service name', example: 'app' }),
  serviceUserId: z.string().openapi({
    description: 'Provided service user Id',
    example: 'fb94de2f-ea1d-4f0f-8b1a-a2d1ca7c0fda',
  }),
  resourcePath: z.string().openapi({
    description: 'Provided resource path',
    example: '/v1/notifications/preferences',
  }),
});

export const internalServerErrorResponseSchema = z.object({
  errorCode: z
    .literal(500)
    .openapi({ description: 'Internal Server Error Code', example: 500 }),
  errorMessage: z.string().openapi({
    description: 'The error message',
    example: 'UDP has not worked',
  }),
  errorType: z.literal('INTERNAL_SERVER_ERROR').openapi({
    description: 'Internal Server Error Type',
    example: 'INTERNAL_SERVER_ERROR',
  }),
});

export type BadRequestResponse = z.infer<typeof badRequestResponseSchema>;
export type UnauthorizedResponse = z.infer<typeof unauthorizedResponseSchema>;
export type ForbiddenResponse = z.infer<typeof forbiddenResponseSchema>;
export type IdentityNotFoundResponse = z.infer<
  typeof identityNotFoundResponseSchema
>;
export type DataNotFoundResponse = z.infer<typeof dataNotFoundResponseSchema>;
export type InternalServerErrorResponse = z.infer<
  typeof internalServerErrorResponseSchema
>;
