import { describe, expect, it, vi } from 'vitest';
import {
  AppConfigDataClient,
  GetLatestConfigurationCommand,
  StartConfigurationSessionCommand,
} from '@aws-sdk/client-appconfigdata';
import { AppConfigFeatureFlagsClient } from './appconfig-client';
import type { AppConfigFeatureFlagsDocument } from './appconfig-types';

describe('AppConfigFeatureFlagsClient', () => {
  const baseOptions = {
    applicationId: 'app-id',
    environmentId: 'env-id',
    configurationProfileId: 'profile-id',
  };

  it('returns parsed feature flags from AppConfig', async () => {
    const featureFlags: AppConfigFeatureFlagsDocument = {
      version: '1',
      flags: {
        featureA: { name: 'Feature A' },
      },
      values: {
        featureA: { enabled: true },
      },
    };

    const send = vi
      .fn()
      .mockResolvedValueOnce({ InitialConfigurationToken: 'token' })
      .mockResolvedValueOnce({
        Configuration: new TextEncoder().encode(JSON.stringify(featureFlags)),
      });

    const client = new AppConfigFeatureFlagsClient({
      ...baseOptions,
      appConfigDataClient: { send } as unknown as AppConfigDataClient,
    });

    const result = await client.getFeatureFlags();

    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0][0]).toBeInstanceOf(
      StartConfigurationSessionCommand,
    );
    expect(send.mock.calls[1][0]).toBeInstanceOf(GetLatestConfigurationCommand);
    expect(result).toEqual(featureFlags);
  });

  it('returns empty feature flags when configuration is empty', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ InitialConfigurationToken: 'token' })
      .mockResolvedValueOnce({ Configuration: new Uint8Array() });

    const client = new AppConfigFeatureFlagsClient({
      ...baseOptions,
      appConfigDataClient: { send } as unknown as AppConfigDataClient,
    });

    const result = await client.getFeatureFlags();

    expect(result).toEqual({ version: '1', flags: {}, values: {} });
  });

  it('returns enabled state for a feature flag', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ InitialConfigurationToken: 'token' })
      .mockResolvedValueOnce({
        Configuration: new TextEncoder().encode(
          JSON.stringify({
            version: '1',
            flags: { featureB: { name: 'Feature B' } },
            values: { featureB: { enabled: true } },
          }),
        ),
      });

    const client = new AppConfigFeatureFlagsClient({
      ...baseOptions,
      appConfigDataClient: { send } as unknown as AppConfigDataClient,
    });

    const enabled = await client.isEnabled('featureB');

    expect(enabled).toBe(true);
  });

  it('throws when AppConfig returns no session token', async () => {
    const send = vi.fn().mockResolvedValueOnce({});

    const client = new AppConfigFeatureFlagsClient({
      ...baseOptions,
      appConfigDataClient: { send } as unknown as AppConfigDataClient,
    });

    await expect(client.getFeatureFlags()).rejects.toThrow(
      'AppConfig session token was not returned.',
    );
  });
});
