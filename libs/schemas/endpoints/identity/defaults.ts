import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export const identityEndpointPathSchema = z.object({
  identifier: z.string('is required').min(1).openapi({
    description: 'The provided User Identifier for the given service',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
  serviceName: z.string('is required').min(1).openapi({
    description: 'The name of the service for which the identifier belongs',
    example: 'app',
  }),
});

export type identityEndpointPathParmeters = z.infer<typeof identityEndpointPathSchema>