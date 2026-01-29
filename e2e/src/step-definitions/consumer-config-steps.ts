import { Given, Then, When } from '@cucumber/cucumber';
import { ApiClient } from 'src/helpers/api-client';
import { ConsumerConfig, getConsumerConfig } from 'src/helpers/secrets-manager';
import { CustomWorld } from 'src/helpers/world';
import { expect } from 'vitest';

let consumerConfig: ConsumerConfig | null = null;

Given('the consumer secret is available', async function () {
  const secretArn = process.env.CONSUMER_CONFIG_SECRET_ARN;
  if (!secretArn) {
    return 'skipped';
  }

  consumerConfig = await getConsumerConfig();
  expect(consumerConfig).not.toBeNull();
});

Then(
  'the consumer config should contain {string}',
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

When(
  'I create and API client using the consumer config credentials',
  async function () {
    if (!consumerConfig) {
      consumerConfig = await getConsumerConfig();
    }

    this.api = new ApiClient(
      consumerConfig.apiUrl,
      consumerConfig.consumerRoleArn,
      consumerConfig.externalId,
    );
  },
);

When(
  'I send a get to {string} using consumer credentials',
  async function (this: CustomWorld, path: string) {
    if (!consumerConfig) {
      consumerConfig = await getConsumerConfig();
    }

    const response = await this.api.get(path, {
      authenticated: false,
      roleArn: consumerConfig.consumerRoleArn,
      externalId: consumerConfig.externalId,
    });
    this.storeResponse(response);
  },
);
