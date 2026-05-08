import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

export const createUserRequestSchema = z.object({
  appId: z.string().openapi({
    description: 'The Users Identifier for the GOVUK App',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
  serviceName: z.enum(['app']).openapi({
    description: 'The service name',
    example: 'app',
  }),
});

export const CreateUserResponseSchema = z.object({}).strict().required();

export type CreateUserRequest = z.infer<typeof createUserRequestSchema>;
export type CreateUserResponse = z.infer<typeof CreateUserResponseSchema>;
