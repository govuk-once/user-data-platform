# AppConfig client library

This library provides a lightweight AppConfig feature flags client for Lambda runtimes.

## Usage

```ts
import { AppConfigFeatureFlagsClient } from '@libs/appconfig';

const client = new AppConfigFeatureFlagsClient({
  applicationId: process.env.APPCONFIG_APPLICATION_ID!,
  environmentId: process.env.APPCONFIG_ENVIRONMENT_ID!,
  configurationProfileId: process.env.APPCONFIG_PROFILE_ID!,
});

const flags = await client.getFeatureFlags();
const isEnabled = await client.isEnabled('enableNewIdentityFlow');
```

## Middy middleware

You can inject the client via Middy using the AppConfig middleware:

```ts
import middy from '@middy/core';
import { appConfigFeatureFlags, getAppConfigClient } from '@libs/utils';

export const handler = middy(async () => {
  // handler logic
}).use(appConfigFeatureFlags({}));

// inside handler, access:
// const client = getAppConfigClient(request);
```

## Environment variables

The middleware reads these by default:

- APPCONFIG_APPLICATION_ID
- APPCONFIG_ENVIRONMENT_ID
- APPCONFIG_PROFILE_ID

You can override the names via `envVarNames` in `appConfigFeatureFlags` options.
