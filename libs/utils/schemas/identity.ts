import { z } from 'zod';

export const IdentityPathSchema = z.object({
  userId: z.string('is required').min(1),
});

export const CraateIdentityRequestSchema = z.object({
  appId: z.string('is required').min(1),
  serviceName: z.string('is required').min(1),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
  ttl: z.number().optional(),
});
