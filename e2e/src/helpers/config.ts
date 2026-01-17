import { config as dotevvConfig } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotevvConfig({ path: resolve(__dirname, '../../.env') });

export interface CognitoClientConfig {
  clientId: string;
  clientSecret: string;
  scopes: string[];
}

export interface E2EConfig {
  apiBaseUrl: string;
  cognito: {
    domain: string;
    tokenEndpoint: string;
    clients: Record<string, CognitoClientConfig>;
    defaultClient: string;
  };
}

function getRequiredEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set.`);
  }
  return value;
}

function getOptionalEnv(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

function loadCognitoClients(): Record<string, CognitoClientConfig> {
  const clients: Record<string, CognitoClientConfig> = {};

  const clientPattern = /^COGNITO_CLIENT_([A-Z0-9_]*)_ID$/;
  const clientNames = new Set<string>();

  for (const key of Object.keys(process.env)) {
    const match = key.match(clientPattern);
    if (match) {
      clientNames.add(match[1]);
    }
  }

  for (const name of clientNames) {
    const clientId = process.env[`COGNITO_CLIENT_${name}_ID`];
    const clientSecret = process.env[`COGNITO_CLIENT_${name}_SECRET`];
    const scopes =
      process.env[`COGNITO_CLIENT_${name}_SCOPES`] || 'api/read api/write';

    if (clientId && clientSecret) {
      const normalizeName = name.toLowerCase().replace(/_/g, '-');
      clients[normalizeName] = {
        clientId,
        clientSecret,
        scopes: scopes.split(' '),
      };
    }
  }

  return clients;
}

export const config: E2EConfig = {
  apiBaseUrl: getRequiredEnv('API_BASE_URL'),
  cognito: {
    domain: getRequiredEnv('COGNITO_DOMAIN'),
    tokenEndpoint: getRequiredEnv('TOKEN_ENDPOINT'),
    clients: loadCognitoClients(),
    defaultClient: getOptionalEnv('COGNITO_DEAULT_CLIENT', 'flex'),
  },
};

export function getCognitoClient(clientName: string): CognitoClientConfig {
  const client = config.cognito.clients[clientName];
  if (!client) {
    throw new Error(`Unknown Cognito Client "${clientName}"`);
  }
  return client;
}
