import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';
import {
  defaultSucccessResponseSchema,
  DefaultSuccessResponse,
} from '../../defaults/success';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

export const getIdentityResponseSchema = z.object({
  serviceId: z.string().openapi({
    description: 'The Identifer for the requested service',
    example: 'ca07a074-ed4b-4426-951e-961bedd80493',
  }),
  serviceName: z.string('is required').min(1).openapi({
    description: 'The service name for the identity record',
    example: 'DVLA',
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

export type GetIdentityResponse = z.infer<typeof getIdentityResponseSchema>;
