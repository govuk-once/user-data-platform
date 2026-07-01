import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export const linkedServicesResponseSchema = z.object({
  linkedServices: z.array(z.string()).openapi({
    description: 'The list of service names linked to the same UDP user',
    example: ['DVLA', 'DWP'],
  }),
});

export type LinkedServicesResponse = z.infer<
  typeof linkedServicesResponseSchema
>;
