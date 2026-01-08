import { Tracer } from '@aws-lambda-powertools/tracer';
import { TracerOptions } from 'node_modules/@aws-lambda-powertools/tracer/lib/esm/types/Tracer';

export { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
export { Tracer } from '@aws-lambda-powertools/tracer';

let tracer;

export const getTracer = (options?: TracerOptions): Tracer =>
  tracer || new Tracer(options);
