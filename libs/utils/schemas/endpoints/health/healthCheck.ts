import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export const healthCheckResponseSchema = z.object({
  status: z
    .literal('healthy')
    .openapi({ description: 'Health status', example: 'healthy' }),
});
