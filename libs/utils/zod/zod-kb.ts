import { z } from 'zod';

const encoder = new TextEncoder();

export const byteLength = (s: string): number => encoder.encode(s).length;

declare module 'zod' {
  interface ZodString {
    maxKB(max: number, message?: string): this;
  }
  interface ZodObject {
    maxKB(max: number, message?: string): this;
  }
}

z.ZodString.prototype.maxKB = function (max: number, message: string) {
  return this.max(max).check((ctx) => {
    const bytes = byteLength(ctx.value);

    if (bytes > max) {
      ctx.issues.push({
        code: 'custom',
        message: message ?? `must be at most ${max} bytes`,
        input: ctx.value,
      });
    }
  });
};

z.ZodObject.prototype.maxKB = function (max: number, message: string) {
  return this.check((ctx) => {
    const bytes = byteLength(JSON.stringify(ctx.value));

    if (bytes > max) {
      ctx.issues.push({
        code: 'custom',
        message: message ?? `must be at most ${max} bytes`,
        input: ctx.value,
      });
    }
  });
};
