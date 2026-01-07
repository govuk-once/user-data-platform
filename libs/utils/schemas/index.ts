import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z from 'zod';

extendZodWithOpenApi(z);

export * from './identity';
export * from './data';

import status from 'statuses';

export const ErrorResponseSchema = z.object({
  body: z.string().openapi({
    description: 'Error message',
    example: 'Error Message',
  }),
});

export const SuccessResponseSchema = z.object({
  body: z.string().openapi({
    description: 'Success message',
    example: 'Success',
  }),
});

export function getErrorDescription(code: number): string {
  return status.message[code] ?? `HTTP ${code}`;
}

export function getErrorSchema(code: number): z.ZodType {
  return z.object({
    body: z.string().openapi({
      description: 'Error message',
      example: status.message[code],
    }),
  });
}

export function getErrorResponse(
  code: number,
  schema: z.ZodType = ErrorResponseSchema,
): {
  description: string;
  content: { 'application/json': { schema: z.ZodType } };
} {
  return {
    description: getErrorDescription(code),
    content: { 'application/json': { schema } },
  };
}

export function getErrorResponses(codes: number[]): Record<
  number,
  {
    description: string;
    content: { 'application/json': { schema: z.ZodType } };
  }
> {
  return Object.fromEntries(
    codes.map((code) => [code, getErrorResponse(code, getErrorSchema(code))]),
  );
}

export function getDefaultErrorCodes(options: {
  hasBody?: boolean;
  hasParams?: boolean;
}): number[] {
  const codes = [401, 403, 500];

  if (options.hasBody) {
    codes.push(422);
  }

  if (options.hasParams) {
    codes.push(404);
  }

  return codes;
}
