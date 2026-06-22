import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export const defaultSuccessResponseSchema = z.object({
  message: z.string().openapi({
    description: 'Server response message',
    example: 'User successfully created',
  }),
});

export type DefaultSuccessResponse = z.infer<
  typeof defaultSuccessResponseSchema
>;
