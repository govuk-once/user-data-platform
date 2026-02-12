import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';
import { defaultSucccessResponseSchema, DefaultSuccessResponse } from '../../defaults/success';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

export const createIdentityRequestSchema = z.object({
  appId: z.string().openapi({
    description: 'The Users Identifier for the GOVUK App',
    example: '8538bc99-3596-4eb3-8101-263e70519315',
  }),
  accessToken: z.string().optional().openapi({
    description: 'The access token for the service from one login',
    example: 'flex',
  }),
  refreshToken: z.string().optional().openapi({
    description: 'The refresh token for the service from one login',
    example: 'flex',
  }),
  idToken: z.string().optional().openapi({
    description: 'The idToken for the service from one login',
    example: 'flex',
  }),
});

export const createIdentityResponseSchema = defaultSucccessResponseSchema;

export type CreateIdentityRequest = z.infer<typeof createIdentityRequestSchema>;
export type CreateIdentityResponse = DefaultSuccessResponse;