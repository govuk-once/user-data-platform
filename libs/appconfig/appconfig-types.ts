export type FeatureFlagValue = {
  enabled: boolean;
  [key: string]: unknown;
};

export type AppConfigFeatureFlagsDocument = {
  version: string;
  flags: Record<
    string,
    {
      name: string;
      description?: string;
      attributes?: Record<string, unknown>;
    }
  >;
  values: Record<string, FeatureFlagValue>;
};
