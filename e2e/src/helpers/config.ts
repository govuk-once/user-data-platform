import { config as dotenvConfig } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenvConfig({ path: resolve(__dirname, '../../.env') });

export interface E2EConfig {
  apiBaseUrl: string;
  awsRegion: string;
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

export const config: E2EConfig = {
  awsRegion: getOptionalEnv('AWS_REGION', 'eu-west-2'),
  apiBaseUrl: getRequiredEnv('API_BASE_URL'),
};
