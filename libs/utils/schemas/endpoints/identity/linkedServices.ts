import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export const linkedServiceSchema = z
  .object({
    serviceName: z.string(),
    ttl: z.number().int().positive().optional(),
  })
  .openapi({
    description: 'A service linked to the same UDP user',
    example: { serviceName: 'DVLA', ttl: 1893456000 },
  });

export const linkedServicesResponseSchema = z.object({
  linkedServices: z.array(linkedServiceSchema).openapi({
    description: 'The list of services linked to the same UDP user',
    example: [{ serviceName: 'DVLA', ttl: 1893456000 }, { serviceName: 'DWP' }],
  }),
});

export type LinkedServicesResponse = z.infer<
  typeof linkedServicesResponseSchema
>;
