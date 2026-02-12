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

export const getDataResponseSchema = z.object({
  data: z
    .object()
    .openapi({
      description: 'The free form JSON data that was stored on the given key',
      example: {
        isEnabled: true,
        identifier: 'abc123',
      },
    })
    .loose(),
});

export type GetDataResponse = z.infer<typeof getDataResponseSchema>;
