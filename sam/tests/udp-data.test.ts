import { beforeAll, describe, expect, it } from 'vitest';

import {
  BASE_URL,
  dvlaService,
  dvlaServiceId,
  appId,
  reachable,
  makeRequest,
  makeOversizedPayload,
} from './test.util';

beforeAll(async () => {
  if (!(await reachable(''))) {
    throw new Error(`SAM Local Api not reachable at ${BASE_URL}`);
  }
});

describe('UDP Data', async () => {
  it('POST /v1/user', async () => {
    const result = await makeRequest({
      url: '/v1/user',
      method: 'POST',
      body: { appId },
    });

    expect(result.status).toBe(204);
  });

  it('POST /v1/identity/{service}/{serviceId}', async () => {
    const result = await makeRequest({
      url: `/v1/identity/${dvlaService}/${dvlaServiceId}`,
      method: 'POST',
      body: { appId },
    });

    expect(result.status).toBe(200);
  });

  it('POST /v1/topics/{service}/{serviceId}', async () => {
    const result = await makeRequest({
      url: `/v1/topics/${dvlaService}/${dvlaServiceId}`,
      method: 'POST',
      headers: {
        'Requesting-Service': dvlaService,
        'Requesting-Service-User-Id': dvlaServiceId,
      },
      body: {
        data: {
          isEnabled: true,
          thing: false,
        },
      },
    });

    expect(result.status).toBe(200);
  });

  it('Oversized Payload - POST /v1/topics/{service}/{serviceId}', async () => {
    const result = await makeRequest({
      url: `/v1/topics/${dvlaService}/${dvlaServiceId}`,
      method: 'POST',
      headers: {
        'Requesting-Service': dvlaService,
        'Requesting-Service-User-Id': dvlaServiceId,
      },
      body: {
        data: makeOversizedPayload(400),
      },
    });

    expect(result.status).toBe(400);
  });
});
