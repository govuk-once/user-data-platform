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

export const deleteIdentityResponseSchema = defaultSucccessResponseSchema;

export type DeleteIdentityResponse = DefaultSuccessResponse;
