import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';
import { identityNotFoundResponseSchema } from '../../defaults/errors';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

export const startSarHeaderSchema = z
  .object({
    'requesting-service': z.string('is required').min(1).openapi({
      description:
        'The name of the requesting service - often the One Login relying-party name',
      example: 'GOVUKAPP',
    }),
    'requesting-service-user-id': z.string('is required').min(1).openapi({
      description:
        'The user identifier used by the requesting service when linking the user to the app',
      example: '277b3076-1485-494d-8dbd-095ea0d7edab',
    }),
  })
  .loose();

export const startSarResponseSchema = z.object({
  sarID: z.string().openapi({
    description: 'UUID of the SAR request',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
});

export type StartSarResponse = z.infer<typeof startSarResponseSchema>;

export const getSarStatusHeaderSchema = z
  .object({
    'requesting-service': z.string('is required').min(1).openapi({
      description:
        'The name of the requesting service - often the One Login relying-party name',
      example: 'GOVUKAPP',
    }),
    'requesting-service-user-id': z.string('is required').min(1).openapi({
      description:
        'The user identifier used by the requesting service when linking the user to the app',
      example: '277b3076-1485-494d-8dbd-095ea0d7edab',
    }),
  })
  .loose();

export const getSarStatusPathSchema = z.object({
  sarId: z.string().min(1).openapi({
    description: 'The SAR request ID',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
});

export const getSarStatusResponseSchema = z.object({
  sarID: z.string().openapi({
    description: 'UUID of the SAR request',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
  expiresAt: z.number().openapi({
    description: 'Timestamp of pre-signed URL expiry (in milliseconds)',
    example: 1746671000000,
  }),
  presignedUrl: z.string().openapi({
    description: 'The pre-signed URL to download the SAR file',
    example: 'https://s3.amazonaws.com/bucket/file.json?X-Amz-Signature=...',
  }),
});

export type GetSarStatusResponse = z.infer<typeof getSarStatusResponseSchema>;

export const sarNotFoundResponseSchema = z.object({
  errorCode: z.literal(404).openapi({
    description: 'Not Found Code',
    example: 404,
  }),
  errorMessage: z.string().openapi({
    description: 'The error message',
    example: 'SAR record not found',
  }),
  errorType: z.literal('SAR_NOT_FOUND').openapi({
    description: 'SAR Not Found Type',
    example: 'SAR_NOT_FOUND',
  }),
  sarId: z.string().openapi({
    description: 'Provided SAR ID',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
});

export type SarNotFoundResponse = z.infer<typeof sarNotFoundResponseSchema>;

export const getSarStatusNotFoundResponseSchema = z.union([
  identityNotFoundResponseSchema,
  sarNotFoundResponseSchema,
]);

export type GetSarStatusNotFoundResponse = z.infer<
  typeof getSarStatusNotFoundResponseSchema
>;
