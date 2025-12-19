import { z } from 'zod';

export const DataPathSchema = z.object({
  userId: z.string('is required').min(1),
  proxy: z.string('is required').min(1),
});

export const CraateDataRequestSchema = z.object({
  ttl: z.number().optional(),
}).passthrough();
