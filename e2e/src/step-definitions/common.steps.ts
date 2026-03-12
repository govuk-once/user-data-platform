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
  'I send a get to {string}',
  async function (this: CustomWorld, path: string) {
    const response = await this.api.get(path, {
      authenticated: this.authenticated,
      headers: this.headers,
    });
    this.storeResponse(response);
  },
);

When(
  'I send a delete to {string}',
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

Then('I should receive a successful response', function (this: CustomWorld) {
  expect(this.lastResponse?.ok).toEqual(true);
});

Then('I should receive an error response', function (this: CustomWorld) {
  expect(this.lastResponse?.ok).toEqual(false);
});

Then(
  'the response should contain {string} with value {string}',
  function (this: CustomWorld, field: string, value: string) {
    const data = this.lastResponse?.body as Record<string, unknown>;
    expect(data[field]).toEqual(value);
  },
);

Then(
  'the response will contain message {string}',
  function (this: CustomWorld, message: string) {
    const data = this.lastResponse?.body as Record<string, unknown>;
    expect(data.message).toEqual(message);
  },
);

Then(
  'the response body contains {string}',
  function (this: CustomWorld, message: string) {
    const data = this.lastResponse?.body as Record<string, unknown>;
    expect(data).toEqual(JSON.parse(message));
  },
);

Then(
  'the response body should contain {string}',
  function (this: CustomWorld, substring: string) {
    const data = this.lastResponse?.body;
    const bodyString = JSON.stringify(data);
    expect(bodyString).toContain(substring);
  },
);

Then(
  'the response at {string} should eventually return status {int} within {int} seconds',
  { timeout: 130_000 },
  async function (
    this: CustomWorld,
    path: string,
    expectedStatus: number,
    timeoutSeconds: number,
  ) {
    const intervalMs = 3000;
    const deadline = Date.now() + timeoutSeconds * 1000;

    while (Date.now() < deadline) {
      const response = await this.api.get(path, {
        authenticated: this.authenticated,
        headers: this.headers,
      });

      if (response.status === expectedStatus) {
        this.storeResponse(response);
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(
      `Expected status ${expectedStatus} at ${path} but did not receive it within ${timeoutSeconds} seconds`,
    );
  },
);

Then(
  'I should receive a {int} response',
  function (this: CustomWorld, expectedStatus: number) {
    expect(this.lastResponse?.status).toEqual(expectedStatus);
  },
);
