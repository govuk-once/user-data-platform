import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export const linkedServicesPathSchema = z.object({
  serviceName: z.string('is required').min(1).openapi({
    description: 'The name of the service for which the identifier belongs',
    example: 'app',
  }),
  serviceId: z.string('is required').min(1).openapi({
    description: 'The provided User Identifier for the given service',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
});

export const linkedServicesResponseSchema = z.object({
  linkedServices: z.array(z.string()).openapi({
    description: 'The list of service names linked to the same UDP user',
    example: ['DVLA', 'DWP'],
  }),
});

export type LinkedServicesResponse = z.infer<
  typeof linkedServicesResponseSchema
>;
