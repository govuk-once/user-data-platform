import {
  AppConfigDataClient,
  GetLatestConfigurationCommand,
  StartConfigurationSessionCommand,
} from '@aws-sdk/client-appconfigdata';
import { AppConfigFeatureFlagsDocument } from './appconfig-types';

export interface AppConfigFeatureFlagsClientOptions {
  readonly applicationId: string;
  readonly environmentId: string;
  readonly configurationProfileId: string;
  readonly appConfigDataClient?: AppConfigDataClient;
  readonly requiredMinimumPollIntervalSeconds?: number;
}

export class AppConfigFeatureFlagsClient {
  private readonly client: AppConfigDataClient;
  private readonly applicationId: string;
  private readonly environmentId: string;
  private readonly configurationProfileId: string;
  private readonly requiredMinimumPollIntervalSeconds: number;

  constructor(options: AppConfigFeatureFlagsClientOptions) {
    this.applicationId = options.applicationId;
    this.environmentId = options.environmentId;
    this.configurationProfileId = options.configurationProfileId;
    this.requiredMinimumPollIntervalSeconds =
      options.requiredMinimumPollIntervalSeconds ?? 15;
    this.client = options.appConfigDataClient ?? new AppConfigDataClient({});
  }

  async getFeatureFlags(): Promise<AppConfigFeatureFlagsDocument> {
    const startSession = new StartConfigurationSessionCommand({
      ApplicationIdentifier: this.applicationId,
      EnvironmentIdentifier: this.environmentId,
      ConfigurationProfileIdentifier: this.configurationProfileId,
      RequiredMinimumPollIntervalInSeconds:
        this.requiredMinimumPollIntervalSeconds,
    });

    const startResponse = await this.client.send(startSession);
    const token = startResponse.InitialConfigurationToken;

    if (!token) {
      throw new Error('AppConfig session token was not returned.');
    }

    const latest = await this.client.send(
      new GetLatestConfigurationCommand({ ConfigurationToken: token }),
    );

    if (!latest.Configuration || latest.Configuration.byteLength === 0) {
      return { version: '1', flags: {}, values: {} };
    }

    const decoded = new TextDecoder('utf-8').decode(latest.Configuration);

    if (!decoded) {
      return { version: '1', flags: {}, values: {} };
    }

    return JSON.parse(decoded) as AppConfigFeatureFlagsDocument;
  }

  async isEnabled(flagName: string): Promise<boolean> {
    const flags = await this.getFeatureFlags();
    return Boolean(flags.values[flagName]?.enabled);
  }
}
