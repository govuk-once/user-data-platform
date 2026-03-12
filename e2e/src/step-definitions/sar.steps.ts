import { Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../helpers/world.js';
import { expect } from 'vitest';

When(
  'I later send a GET to {string}',
  async function (this: CustomWorld, pathTemplate: string) {
    // Extract sarId from the response body of the previous POST to /v1/sar
    const previousResponse = this.lastResponse?.body as Record<string, unknown>;
    const sarId = previousResponse?.sarID as string;

    if (!sarId) {
      throw new Error('No sarID found in previous response');
    }

    // Store sarId in context for later use
    this.setContext('sarId', sarId);

    // Replace {sarId} in the path template with the actual sarId
    const path = pathTemplate.replace('{sarId}', sarId);

    const response = await this.api.get(path, {
      authenticated: this.authenticated,
      headers: this.headers,
    });
    this.storeResponse(response);
  },
);

Then(
  'the response should contain the presignedUrl',
  function (this: CustomWorld) {
    const data = this.lastResponse?.body as Record<string, unknown>;
    expect(data).toHaveProperty('presignedUrl');
    expect(typeof data.presignedUrl).toBe('string');
    expect(data.presignedUrl).toBeTruthy();

    // Store presignedUrl in context for the next step
    this.setContext('presignedUrl', data.presignedUrl);
  },
);

When('I call the presignedUrl', async function (this: CustomWorld) {
  const presignedUrl = this.getContext<string>('presignedUrl');

  if (!presignedUrl) {
    throw new Error('No presignedUrl found in context');
  }

  // Make a raw fetch request to the presigned URL (not using the API client since it's an S3 URL)
  const response = await fetch(presignedUrl);

  if (!response.ok) {
    throw new Error(
      `Failed to download file from presigned URL: ${response.status} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get('content-type');
  const text = await response.text();

  let body;
  if (
    contentType?.includes('application/json') ||
    contentType?.includes('text/json')
  ) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  } else {
    body = text;
  }

  // Store the response from the presigned URL
  this.storeResponse({
    status: response.status,
    headers: response.headers,
    body,
    ok: response.ok,
  });
});

Then('a .json file should be downloaded', function (this: CustomWorld) {
  const data = this.lastResponse?.body;
  expect(data).toBeDefined();
  expect(typeof data).toBe('object');
});

Then('it should contain the expected user data', function (this: CustomWorld) {
  const data = this.lastResponse?.body as Record<string, unknown>;

  // Verify the SAR file contains the expected structure and data
  expect(data).toBeDefined();
  expect(data).toHaveProperty('identities');
  expect(data).toHaveProperty('userData');

  // Check that identities array contains our user identities
  const identities = data.identities as Array<Record<string, unknown>>;
  expect(Array.isArray(identities)).toBe(true);
  expect(identities.length).toBeGreaterThan(0);

  // Verify we have the expected identities
  const hasAppIdentity = identities.some(
    (id: Record<string, unknown>) =>
      id.serviceName === 'app' && id.serviceUserId === 'sar-e2e-user-1',
  );
  expect(hasAppIdentity).toBe(true);

  // Check that userData contains our posted data
  const userData = data.userData as Record<string, unknown>;
  expect(userData).toBeDefined();

  // Check if userData is an object with our data
  const userDataString = JSON.stringify(userData);
  expect(userDataString).toContain('value1');
  expect(userDataString).toContain('value2');
  expect(userDataString).toContain('important info');
  expect(userDataString).toContain('additional info');
});
