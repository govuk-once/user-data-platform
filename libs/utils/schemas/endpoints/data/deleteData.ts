import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

export { defaultSuccessResponseSchema as deleteDataResponseSchema } from '../../defaults/success';
export type { DefaultSuccessResponse as DeleteDataResponse } from '../../defaults/success';
