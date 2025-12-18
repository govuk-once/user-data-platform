import { z } from 'zod';

export const PathSchema = z.object({
  userId: z.string('is required').min(1),
});

export const BodySchema = z.object({
  appId: z.string('is required').min(1),
  serviceName: z.string('is required').min(1),
  udpId: z.string().optional(),
  accessToken: z.string().optional(),
  refreshToken: z.string().optional(),
  idToken: z.string().optional(),
  ttl: z.number().optional(),
});
