import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/
export const exchangeIdentityHeaderSchema = z
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

export const exchangeIdentityQuerySchama = z.object({
  requiredService: z.string('is Required').min(1).openapi({
    description: 'The service name to look up the linked identity for',
    example: 'DVLA',
  }),
});

export type ExchangeIdentityHeaders = z.infer<
  typeof exchangeIdentityHeaderSchema
>;
export type ExchangeIdentityQuery = z.infer<typeof exchangeIdentityQuerySchama>;
