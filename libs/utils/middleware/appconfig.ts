import middy from '@middy/core';
import type { Context } from 'aws-lambda';
import { AppConfigFeatureFlagsClient } from '@libs/appconfig';

const APPCONFIG_CLIENT_KEY = Symbol('appConfigClient');

export interface AppConfigMiddlewareOptions {
  applicationId?: string;
  environmentId?: string;
  configurationProfileId?: string;
  requiredMinimumPollIntervalSeconds?: number;
  appConfigClient?: AppConfigFeatureFlagsClient;
  envVarNames?: {
    applicationId?: string;
    environmentId?: string;
    configurationProfileId?: string;
  };
}

export interface RequestWithAppConfig<TEvent = unknown, TResult = unknown> {
  event: TEvent;
  context: Context;
  response: TResult | null;
  error: Error | null;
  internal: {
    [APPCONFIG_CLIENT_KEY]?: AppConfigFeatureFlagsClient;
    [key: string | symbol]: unknown;
  };
}

const DEFAULT_ENV_VARS = {
  applicationId: 'APPCONFIG_APPLICATION_ID',
  environmentId: 'APPCONFIG_ENVIRONMENT_ID',
  configurationProfileId: 'APPCONFIG_PROFILE_ID',
};

const resolveId = (
  explicitValue: string | undefined,
  envVarName: string,
): string | undefined => {
  if (explicitValue) return explicitValue;
  const envValue = process.env[envVarName];
  return envValue && envValue !== '' ? envValue : undefined;
};

export function getAppConfigClient<TEvent, TResult>(
  request: RequestWithAppConfig<TEvent, TResult>,
): AppConfigFeatureFlagsClient {
  const client = request.internal[APPCONFIG_CLIENT_KEY];
  if (!client) {
    throw new Error(
      'AppConfig client not found. Ensure appConfig middleware is configured',
    );
  }
  return client;
}

export function appConfigFeatureFlags<TEvent = unknown, TResult = unknown>(
  options: AppConfigMiddlewareOptions,
): middy.MiddlewareObj<TEvent, TResult, Error, Context> {
  const envVarNames = {
    ...DEFAULT_ENV_VARS,
    ...options.envVarNames,
  };

  return {
    before: async (request) => {
      let client = options.appConfigClient;

      if (!client) {
        const applicationId = resolveId(
          options.applicationId,
          envVarNames.applicationId,
        );
        const environmentId = resolveId(
          options.environmentId,
          envVarNames.environmentId,
        );
        const configurationProfileId = resolveId(
          options.configurationProfileId,
          envVarNames.configurationProfileId,
        );

        if (!applicationId || !environmentId || !configurationProfileId) {
          throw new Error(
            'AppConfig middleware requires applicationId, environmentId, and configurationProfileId',
          );
        }

        client = new AppConfigFeatureFlagsClient({
          applicationId,
          environmentId,
          configurationProfileId,
          requiredMinimumPollIntervalSeconds:
            options.requiredMinimumPollIntervalSeconds,
        });
      }

      const reqWithAppConfig = request as unknown as RequestWithAppConfig<
        TEvent,
        TResult
      >;
      if (!reqWithAppConfig.internal) {
        reqWithAppConfig.internal = {};
      }
      reqWithAppConfig.internal[APPCONFIG_CLIENT_KEY] = client;
    },
  };
}
