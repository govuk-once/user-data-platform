import { Given, Then, When } from '@cucumber/cucumber';
import {
  authenticateWithConsumerConfig,
  ConsumerConfig,
  getConsumerConfig,
} from 'src/helpers/secrets-manager';
import { CustomWorld } from 'src/helpers/world';
import { expect } from 'vitest';

let consumerConfig: ConsumerConfig | null = null;
let consumerAccessToken: string | null = null;

Given('the consumer secret is available', async function () {
  const secretArn = process.env.CONSUMER_CONFIG_SECRET_ARN;
  if (!secretArn) {
    return 'skipped';
  }

  consumerConfig = await getConsumerConfig();
  expect(consumerConfig).not.toBeNull();
});

Then(
  'the consumer config should comtain {string',
  async function (fieldName: string) {
    if (!consumerConfig) {
      throw new Error('consumer config not loaded');
    }

    const value = consumerConfig[fieldName as keyof ConsumerConfig];
    expect(value).toBeDefined();
    expect(value).not.toBeNull();
    expect(value).not.toEqual('');
  },
);

When('I authenticate using the consuer config credentials', async function () {
  if (!consumerConfig) {
    consumerConfig = await getConsumerConfig();
  }

  consumerAccessToken = await authenticateWithConsumerConfig();
});

Then('I should recieve a valid access token', async function () {
  expect(consumerAccessToken).not.toBeNull();
  expect(consumerAccessToken).not.toEqual('');
  expect(consumerAccessToken!.split('.').length).toEqual(3);
});

When(
  'I send a get to {string} using consumer credentials',
  async function (this: CustomWorld, path: string) {
    if (!consumerAccessToken) {
      throw new Error('Consumer access token not available');
    }

    const response = await this.api.get(path, {
      authenticated: false,
      apitoken: consumerAccessToken,
    });
    this.storeResponse(response);
  },
);
