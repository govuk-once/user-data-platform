import { Given, Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../helpers/world.js';
import { expect } from 'vitest';
import { registerCreateUser } from 'src/helpers/cleanup.js';

Given('I am authenticated', async function (this: CustomWorld) {
  this.enableAuth();
});

Given('I am not authenticated', async function (this: CustomWorld) {
  this.disableAuth();
});

Given(
  'I set header {string} to {string}',
  async function (this: CustomWorld, name: string, value: string) {
    this.setHeader(name, value);
  },
);

When(
  'I send a post to {string} with the body {string}',
  async function (this: CustomWorld, path: string, json: string) {
    const data = JSON.parse(json);
    const response = await this.api.post(path, data, {
      authenticated: this.authenticated,
      headers: this.headers,
    });
    this.storeResponse(response);

    if (path === '/user' && response.ok && data.appId) {
      registerCreateUser(data.appId);
    }
  },
);

When(
  'i send a get to {string}',
  async function (this: CustomWorld, path: string) {
    const response = await this.api.get(path, {
      authenticated: this.authenticated,
      headers: this.headers,
    });
    this.storeResponse(response);
  },
);

When(
  'i send a delete to {string}',
  async function (this: CustomWorld, path: string) {
    const response = await this.api.delete(path, {
      authenticated: this.authenticated,
      headers: this.headers,
    });
    this.storeResponse(response);
  },
);

Then(
  'the response status should be {int}',
  function (this: CustomWorld, expectedStatus: number) {
    expect(this.lastResponse?.status).toEqual(expectedStatus);
  },
);

Then('I should recieve a successful response', function (this: CustomWorld) {
  expect(this.lastResponse?.ok).toEqual(true);
});

Then('I should recieve an error response', function (this: CustomWorld) {
  expect(this.lastResponse?.ok).toEqual(false);
});

Then(
  'The response should contain {string} with value {string}',
  function (this: CustomWorld, field: string, value: string) {
    const data = this.lastResponse?.body as Record<string, unknown>;
    expect(data[field]).toEqual(value);
  },
);

Then(
  'The response will contain message {string}',
  function (this: CustomWorld, message: string) {
    const data = this.lastResponse?.body as Record<string, unknown>;
    expect(data.message).toEqual(message);
  },
);

Then(
  'The response body contain body {string}',
  function (this: CustomWorld, message: string) {
    const data = this.lastResponse?.body as Record<string, unknown>;
    expect(data).toEqual(JSON.parse(message));
  },
);
