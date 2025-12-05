import { Given, Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../helpers/world.js';
import { expect } from 'vitest';

Given(
  'I am authenticated as {string}',
  async function (this: CustomWorld, clientName: string) {
    this.setClient(clientName);
  },
);

When(
  'I send a post to {string} with the body {string}',
  async function (this: CustomWorld, path: string, json: string) {
    const data = JSON.parse(json);

    const response = await this.api.post(path, data, {
      authenticated: this.authenticated,
    });
    this.storeResponse(response);
  },
);

When(
  'i send a get to {string}',
  async function (this: CustomWorld, path: string) {
    const response = await this.api.get(path,{
      authenticated: this.authenticated,
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
    const data = this.lastResponse?.data as Record<string, unknown>;
    expect(data[field]).toEqual(value);
  },
);

Then('The response will contain message {string}', function(this:CustomWorld, message:string) {
  const data = this.lastResponse?.data as Record<string, unknown>;
  expect(data.message).toEqual(message);
})
