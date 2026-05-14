import { beforeAll, describe, expect, it } from 'vitest';

import {
  BASE_URL,
  dvlaService,
  dvlaServiceId,
  appService,
  appId,
  reachable,
  makeRequest,
} from './test.util';

beforeAll(async () => {
  if (!(await reachable(''))) {
    throw new Error(`SAM Local Api not reachable at ${BASE_URL}`);
  }
});

describe('UDP Identity', async () => {
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

  it('App - GET /v1/identity/{service}/{serviceId}', async () => {
    const result = await makeRequest({
      url: `/v1/identity/${appService}/${appId}`,
    });

    expect(result.status).toBe(200);
  });

  it('DVLA - GET /v1/identity/{service}/{serviceId}', async () => {
    const result = await makeRequest({
      url: `/v1/identity/${dvlaService}/${dvlaServiceId}`,
    });

    expect(result.status).toBe(200);
  });
});
