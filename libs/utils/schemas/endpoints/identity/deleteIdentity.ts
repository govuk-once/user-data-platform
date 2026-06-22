import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

/*
 Request Schema & Type
 Response Schemas & Types
*/

export { defaultSuccessResponseSchema as deleteIdentityResponseSchema } from '../../defaults/success';
export { DefaultSuccessResponse as DeleteIdentityResponse } from '../../defaults/success';
