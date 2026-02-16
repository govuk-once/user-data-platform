import middy from '@middy/core';
import type { Context } from 'aws-lambda';
import { Logger } from '../logger/Logger';
import { BaseUDPError, MissingEnvironmentVariablesError, UDP_ERROR_TYPES } from '../Errors';

export type OptionalEnvConfig<T extends string = string> = {
  [K in T]: string;
};

export interface EnvValidatorOptions {
  required?: string[];

  optional?: Record<string, string>;

  logger?: Logger;
}

export interface ValidatorEnv {
  get(name: string): string;

  getAll(): Record<string, string>;
}

const VALIDATED_ENV_KEY = Symbol('validatedEnv');

export interface RequestWithEnv<TEvent = unknown, TResult = unknown> {
  event: TEvent;
  context: Context;
  response: TResult | null;
  error: Error | null;
  internal: {
    [VALIDATED_ENV_KEY]?: ValidatorEnv;
    [key: string | symbol]: unknown;
  };
}

export function getValidatedEnv<TEvent, TResult>(
  request: RequestWithEnv<TEvent, TResult>,
): ValidatorEnv {
  const env = request.internal[VALIDATED_ENV_KEY];
  if (!env) {
    throw new BaseUDPError(
      'Validated environement not found, Ensure envValidator middleware is configured',
      UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
    );
  }
  return env;
}

export function envValidator<TEvent = unknown, TResult = unknown>(
  options: EnvValidatorOptions,
): middy.MiddlewareObj<TEvent, TResult, Error, Context> {
  const { required = [], optional = {}, logger = console } = options;

  if (required.length === 0 && Object.keys(optional).length === 0) {
    throw new BaseUDPError(
      'envValidator requires at least one required or optional environment variable',
      UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
    );
  }

  return {
    before: async (request) => {
      const missingVaraiables: string[] = [];
      const validatedValues: Record<string, string> = {};

      for (const varName of required) {
        const value = process.env[varName];

        if (value === undefined || value === '') {
          missingVaraiables.push(varName);
        } else {
          validatedValues[varName] = value;
        }
      }

      if (missingVaraiables.length > 0) {
        const errorMessage = `Missing required environment variables: ${missingVaraiables.join(', ')}`;
        logger.error(errorMessage);
        throw new MissingEnvironmentVariablesError(
          errorMessage,
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
          missingVaraiables,
        );
      }

      for (const [varName, defaultValue] of Object.entries(optional)) {
        const value = process.env[varName];
        validatedValues[varName] =
          value !== undefined && value !== '' ? value : defaultValue;
      }

      const validatedEnv: ValidatorEnv = {
        get(name: string): string {
          const val = validatedValues[name];
          if (val === undefined) {
            throw new BaseUDPError(
              `Env var ${name} was not in the validated list`,
              UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
            );
          }
          return val;
        },
        getAll(): Record<string, string> {
          return { ...validatedValues };
        },
      };

      const reqWithEnv = request as unknown as RequestWithEnv<TEvent, TResult>;
      if (!reqWithEnv.internal) {
        reqWithEnv.internal = {};
      }
      reqWithEnv.internal[VALIDATED_ENV_KEY] = validatedEnv;
    },
  };
}

export function createEnvValidator<
  TRequired extends string[],
  TOptional extends Record<string, string>,
>(config: {
  required?: TRequired;
  optional?: TOptional;
  logger?: Logger;
}): {
  middleware: middy.MiddlewareObj<unknown, unknown, Error, Context>;
  getEnv: () => { [K in TRequired[number]]: string } & {
    [K in keyof TOptional]: string;
  };
} {
  const {
    required = [] as unknown as TRequired,
    optional = {} as TOptional,
    ...rest
  } = config;

  let cachedEnv: Record<string, string> | null = null;

  const middleware = envValidator({
    ...rest,
    required: [...required] as string[],
    optional: optional as OptionalEnvConfig,
  });

  const origialBefore = middleware.before!;
  middleware.before = async (request) => {
    await origialBefore(request);
    const reqWithEnv = request as unknown as RequestWithEnv;
    cachedEnv = reqWithEnv.internal[VALIDATED_ENV_KEY]?.getAll() ?? null;
  };

  return {
    middleware,
    getEnv: () => {
      if (!cachedEnv) {
        throw new BaseUDPError(
          'getEnv() called before middleware executed',
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        );
      }
      return cachedEnv as { [K in TRequired[number]]: string } & {
        [K in keyof TOptional]: string;
      };
    },
  };
}
