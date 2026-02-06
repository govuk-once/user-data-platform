import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
extendZodWithOpenApi(z);

export const CreateUserSchema = z.object({
  appId: z.string('is required').min(1).openapi({
    description: 'The Pairwise ID',
    example: '123456-789910-11121314-15',
  }),
});

export const IdentityPathSchema = z.object({
  identifier: z.string('is required').min(1).openapi({
    description: 'The One login',
    example: '123',
  }),
  serviceName: z.string('is required').min(1).openapi({
    description: 'The name of the service for which the id belongs',
    example: 'app',
  }),
});

export const CreateIdentityRequestSchema = z.object({
  appId: z.string('is required').min(1).openapi({
    description: 'The AppId from the app',
    example: '123',
  }),
  accessToken: z.string().optional().openapi({
    description: 'The access token for the service from one login',
    example: 'flex',
  }),
  refreshToken: z.string().optional().openapi({
    description: 'The refresh token for the service from one login',
    example: 'flex',
  }),
  idToken: z.string().optional().openapi({
    description: 'The idToken for the service from one login',
    example: 'flex',
  }),
  ttl: z.number().optional().openapi({
    description: 'The Time to live to handle auto expiry/deletion of data',
    example: 'flex',
  }),
});

export const CreateIdentityResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 201,
  }),
  body: z.string('is required').min(1).openapi({
    description: 'message',
    example: 'Identity Successfully created',
  }),
});

export const CreateUserResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 201,
  }),
  body: z.string('is required').min(1).openapi({
    description: 'message',
    example: 'User Successfully Created',
  }),
});

export const CreateUserExistsResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 200,
  }),
  body: z.string('is required').min(1).openapi({
    description: 'message',
    example: 'User already exists',
  }),
});

export const DeleteIdentityResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 200,
  }),
  body: z.string('is required').min(1).openapi({
    description: 'message',
    example: 'Successfully deleted Identity',
  }),
});

export const IdentityResponseSchema = z.object({
  statusCode: z.number().openapi({
    description: 'The status code of the response',
    example: 200,
  }),
  body: z.object({
    appId: z.string('is required').min(1).openapi({
      description: 'The AppId from the app',
      example: '123',
    }),
    serviceName: z.string('is required').min(1).openapi({
      description: 'The service name of the identity record',
      example: 'flex',
    }),
    accessToken: z.string().optional().openapi({
      description: 'The access token for the service from one login',
      example: 'flex',
    }),
    refreshToken: z.string().optional().openapi({
      description: 'The refresh token for the service from one login',
      example: 'flex',
    }),
    idToken: z.string().optional().openapi({
      description: 'The idToken for the service from one login',
      example: 'flex',
    }),
  }),
});
