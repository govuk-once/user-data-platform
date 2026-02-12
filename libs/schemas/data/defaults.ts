import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';
import {
  dataNotFoundResponseSchema,
  identityNotFoundResponseSchema,
} from '../defaults/errors';

extendZodWithOpenApi(z);

export const dataEndpointHeaderSchema = z
  .object({
    'requesting-service': z.string('is required').min(1).openapi({
      description:
        'The name of the requesting service - often the One Login relying-party name',
      example: 'GOVUKAPP',
    }),
    'requesting-service-user-id': z.string('is required').min(1).openapi({
      description:
        'The user identifier used by the requesting service when linking the user to the app',
      example: '277b3076-1485-494d-8dbd-095ea0d7edab',
    }),
  })
  .loose();

export const dataEndpointPathSchema = z.object({
  resourcePath: z.string('is required').min(1).openapi({
    description: 'The resource path that the data is held under',
    example: 'topics',
  }),
});

export const dataEndpointNotFoundResponseSchema = z.union([
  identityNotFoundResponseSchema,
  dataNotFoundResponseSchema,
]);

export type DataEndpointHeaders = z.infer<typeof dataEndpointHeaderSchema>;
export type DataEndpointPathParmeters = z.infer<typeof dataEndpointPathSchema>;
export type DataEndpointNotFoundResponse = z.infer<
  typeof dataEndpointNotFoundResponseSchema
>;
