import { AppConfigFeatureFlags } from '../lib/constructs/appconfig-construct';
import { GovUkOnceEnvironments } from './environment';

export const featureFlagsByEnvironment: Record<string, AppConfigFeatureFlags> =
  {
    [GovUkOnceEnvironments.Dev]: {
      version: '1',
      flags: {
        enableNewIdentityFlow: {
          name: 'Enable new identity flow',
          description: 'Turns on the new identity creation flow',
        },
      },
      values: {
        enableNewIdentityFlow: {
          enabled: true,
        },
      },
    },
    [GovUkOnceEnvironments.Stag]: {
      version: '1',
      flags: {
        enableNewIdentityFlow: {
          name: 'Enable new identity flow',
          description: 'Turns on the new identity creation flow',
        },
      },
      values: {
        enableNewIdentityFlow: {
          enabled: false,
        },
      },
    },
    [GovUkOnceEnvironments.Prod]: {
      version: '1',
      flags: {
        enableNewIdentityFlow: {
          name: 'Enable new identity flow',
          description: 'Turns on the new identity creation flow',
        },
      },
      values: {
        enableNewIdentityFlow: {
          enabled: false,
        },
      },
    },
  };
