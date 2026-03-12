import { Then, When } from '@cucumber/cucumber';
import { CustomWorld } from '../helpers/world.js';
import { expect } from 'vitest';

When(
  'I wait for the SAR to complete',
  { timeout: 130_000 },
  async function (this: CustomWorld) {
    // Extract sarId from the response body of the previous POST to /v1/sar
    const previousResponse = this.lastResponse?.body as Record<string, unknown>;
    const sarId = previousResponse?.sarID as string;

    if (!sarId) {
      throw new Error('No sarID found in previous response');
    }

    // Store sarId in context for later use
    this.setContext('sarId', sarId);

    const path = `v1/sar/${sarId}`;
    const intervalMs = 3000;
    const timeoutSeconds = 120;
    const deadline = Date.now() + timeoutSeconds * 1000;

    while (Date.now() < deadline) {
      const response = await this.api.get(path, {
        authenticated: this.authenticated,
        headers: this.headers,
      });

      // Check if the SAR is complete (status 200 and has presignedUrl)
      if (response.status === 200) {
        const body = response.body as Record<string, unknown>;
        if (body.presignedUrl) {
          this.storeResponse(response);
          return;
        }
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`SAR did not complete within ${timeoutSeconds} seconds`);
  },
);

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
  const data = this.lastResponse?.body;

  // Verify the SAR file is an array of data records
  expect(data).toBeDefined();
  expect(Array.isArray(data)).toBe(true);

  const dataRecords = data as Array<Record<string, unknown>>;
  expect(dataRecords.length).toBeGreaterThan(0);

  // Convert all records to a string to search for our test data
  const allDataString = JSON.stringify(dataRecords);

  // Verify the SAR file contains the expected user data
  expect(allDataString).toContain('value1');
  expect(allDataString).toContain('value2');
  expect(allDataString).toContain('important info');
  expect(allDataString).toContain('additional info');

  // Verify each record has a resourcePath
  dataRecords.forEach((record) => {
    expect(record).toHaveProperty('resourcePath');
  });

  // Verify we have the specific data records we created
  const hasData1 = dataRecords.some(
    (record) =>
      record.resourcePath === '/sar-test/data1' &&
      JSON.stringify(record).includes('value1'),
  );
  const hasData2 = dataRecords.some(
    (record) =>
      record.resourcePath === '/sar-test/data2' &&
      JSON.stringify(record).includes('value2'),
  );

  expect(hasData1).toBe(true);
  expect(hasData2).toBe(true);
});
