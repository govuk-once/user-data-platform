import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
extendZodWithOpenApi(z);

export const DataPathSchema = z.object({
  identifier: z.string('is required').min(1).openapi({
    description: 'The One login',
    example: '123',
  }),
  proxy: z.string('is required').min(1).openapi({
    description: 'The resource path',
    example: 'topics',
  }),
});

export const CreateDataRequestSchema = z
  .object({
    ttl: z.number().optional().openapi({
      description: 'The Time to live for the automatic deletion/expiry of data',
      example: 100,
    }),
  })
  .passthrough();

export const CreateDataResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 201,
  }),
  body: z.string('is required').min(1).openapi({
    description: 'message',
    example: 'Entity saved successfully',
  }),
});

export const DataResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 200,
  }),
  body: z.object({
    data: z.object().openapi({
      description: 'The data that was saved',
      example: {
        additionalProp1: 'string',
        additionalProp2: 'string',
        additionalProp3: 'string',
      },
    }),
  }),
});

export const DeleteDataResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 200,
  }),
  body: z.string('is required').min(1).openapi({
    description: 'message',
    example: 'Entity Successfully deleted',
  }),
});
