import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

export interface ConsumerConfig {
  region: string;
  apiAccountId: string;
  apiUrl: string;
  consumerRoleArn: string;
  externalId?: string;
  apiKey?: string;
}

let cachedConsumerConfig: ConsumerConfig | null = null;

export async function getConsumerConfig(): Promise<ConsumerConfig> {
  if (cachedConsumerConfig) {
    return cachedConsumerConfig;
  }

  const secretArn = process.env.CONSUMER_CONFIG_SECRET_ARN;
  if (!secretArn) {
    throw new Error(
      'CONSUMER_CONFIG_SECRET_ARN environment variable is not set',
    );
  }

  const region = process.env.AWS_REGION || 'eu-west-2';
  const client = new SecretsManagerClient({ region });

  const command = new GetSecretValueCommand({
    SecretId: secretArn,
  });

  const response = await client.send(command);

  if (!response.SecretString) {
    throw new Error('Consumer config secret is empty');
  }

  cachedConsumerConfig = JSON.parse(response.SecretString) as ConsumerConfig;
  return cachedConsumerConfig;
}

export function clearConsumerConfig(): void {
  cachedConsumerConfig = null;
}
