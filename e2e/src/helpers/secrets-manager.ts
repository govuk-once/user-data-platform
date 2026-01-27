import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

export interface ConsumerConfig {
  privateLinkServiceName: string;
  region: string;
  apiAccountId: string;
  availabilityZones: string;
  cognitoTokenEndpoint: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoClientSecret: string;
}

let cachedConsumerConfig: ConsumerConfig | null = null;

export async function getConsumerConfig(): Promise<ConsumerConfig> {
  if (cachedConsumerConfig) {
    return cachedConsumerConfig;
  }

  const secretArn = process.env.CONSUMER_CONFIG_SECRET_ARN;
  if (!secretArn) {
    throw new Error('CONSUMER_CONFIG_SECRET_ARN enviroment variable isnot set');
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

export async function authenticateWithConsumerConfig(): Promise<string> {
  const config = await getConsumerConfig();

  const credentials = Buffer.from(
    `${config.cognitoClientId}:${config.cognitoClientSecret}`,
  );

  const response = await fetch(config.cognitoTokenEndpoint, {
    method: 'post',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.cognitoClientId,
      scope: `udp/read udp/write udp/delete`,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to authenticate : ${errorText}`);
  }

  const tokenResponse = (await response.json()) as { acceess_token: string };
  return tokenResponse.acceess_token;
}
