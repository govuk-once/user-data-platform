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

export const deleteDataResponseSchema = defaultSucccessResponseSchema;

export type DeleteDataResponse = DefaultSuccessResponse;
