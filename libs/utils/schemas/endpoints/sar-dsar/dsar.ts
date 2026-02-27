import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

export const startDsarHeaderSchema = z
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

export const startDsarResponseSchema = z.object({
  dsarID: z.string().openapi({
    description: 'UUID of the DSAR request',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
});


export type StartDsarResponse = z.infer<typeof startDsarResponseSchema>;
