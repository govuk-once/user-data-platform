import { describe, expect, it } from 'vitest';
import { appConfigFeatureFlags, getAppConfigClient } from './appconfig';
import type { RequestWithAppConfig } from './appconfig';
import { AppConfigFeatureFlagsClient } from '@libs/appconfig';

const createRequest = () =>
  ({
    event: {},
    context: {} as never,
    response: null,
    error: null,
    internal: {},
  }) satisfies RequestWithAppConfig;

describe('appConfigFeatureFlags middleware', () => {
  it('attaches provided AppConfig client to request', async () => {
    const mockClient = new AppConfigFeatureFlagsClient({
      applicationId: 'app-id',
      environmentId: 'env-id',
      configurationProfileId: 'profile-id',
    });

    const middleware = appConfigFeatureFlags({ appConfigClient: mockClient });
    const request = createRequest();

    await middleware.before!(request as never);

    const resolved = getAppConfigClient(request as never);
    expect(resolved).toBe(mockClient);
  });

  it('throws when required identifiers are missing', async () => {
    const middleware = appConfigFeatureFlags({});
    const request = createRequest();

    await expect(middleware.before!(request as never)).rejects.toThrow(
      'AppConfig middleware requires applicationId, environmentId, and configurationProfileId',
    );
  });

  it('constructs client from environment variables', async () => {
    process.env.APPCONFIG_APPLICATION_ID = 'app-id';
    process.env.APPCONFIG_ENVIRONMENT_ID = 'env-id';
    process.env.APPCONFIG_PROFILE_ID = 'profile-id';

    const middleware = appConfigFeatureFlags({});
    const request = createRequest();

    await middleware.before!(request as never);

    const resolved = getAppConfigClient(request as never);
    expect(resolved).toBeInstanceOf(AppConfigFeatureFlagsClient);
  });
});
