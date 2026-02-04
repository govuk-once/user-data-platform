import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
extendZodWithOpenApi(z);

export const DataPathSchema = z.object({
  resourcePath: z.string('is required').min(1).openapi({
    description: 'The resource path that the data is held under',
    example: 'topics',
  }),
});

export const DataHeaderSchema = z.object({
  "requesting-service": z.string('is required').min(1).openapi({
    description: 'The name of the requesting service - often the One Login relying-party name',
    example: 'GOVUKAPP'
  }),
  "requesting-service-user-id": z.string('is required').min(1).openapi({
    description: 'The user identifier used by the requesting service when linking the user to the app',
    example: '277b3076-1485-494d-8dbd-095ea0d7edab'
  })
})

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
