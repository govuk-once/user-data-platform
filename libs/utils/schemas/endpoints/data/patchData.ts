import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

const getCurrentTime = Math.floor(Date.now() / 1000);

const dataObjectSchema = z
  .object()
  .required()
  .openapi({
    description: 'The free form JSON data to store on your key',
    example: {
      isEnabled: true,
      identifier: 'abc123',
    },
  })
  .loose();

export const patchDataRequestSchema = z.object({
  configuration: z
    .object({
      expiryMechanism: z.enum(['DELETE']).optional().openapi({
        description: 'The UDP mechanism to execute at expiry',
        example: 'DELETE',
      }),
      expiresAt: z.number().int().gt(getCurrentTime).optional().openapi({
        description:
          'The expiry time for the data in EPOCH Timestamp no milliseconds, must be future dated',
        example: 1738671000,
      }),
    })
    .optional(),
  data: dataObjectSchema,
});

export const patchDataResponseSchema = dataObjectSchema;

export type PatchDataRequest = z.infer<typeof patchDataRequestSchema>;
export type PatchDataResponse = z.infer<typeof patchDataResponseSchema>;
