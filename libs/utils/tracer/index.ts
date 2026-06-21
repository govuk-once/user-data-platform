import { Tracer } from '@aws-lambda-powertools/tracer';

export { captureLambdaHandler } from '@aws-lambda-powertools/tracer/middleware';
export { Tracer } from '@aws-lambda-powertools/tracer';

type TracerOptions = ConstructorParameters<typeof Tracer>[0];

let tracer: Tracer | undefined;

export const getTracer = (options?: TracerOptions): Tracer =>
  tracer ?? new Tracer(options);
