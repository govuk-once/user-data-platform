import http, { RefinedResponse, ResponseType } from 'k6/http';
import { check } from 'k6';
import { config } from '../config';
import { signedHeaders } from './auth';

const okOrNotFound = http.expectedStatuses(200, 404);
const okOrNoContent = http.expectedStatuses(200, 204);

function buildUrl(path: string): string {
  const base = config.apiBaseUrl.replace(/\/+$/, '');
  const normalised = path.replace(/^\/+/, '');
  return `${base}/${normalised}`;
}

function mergeHeaders(
  signed: Record<string, string>,
  extra?: Record<string, string>,
): Record<string, string> {
  if (!extra) return signed;
  return { ...signed, ...extra };
}

export function getData(
  path: string,
  headers?: Record<string, string>,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/${path}`);
  const reqHeaders = mergeHeaders(signedHeaders('GET', url), headers);
  const res = http.get(url, {
    headers: reqHeaders,
    responseCallback: okOrNotFound,
  });

  if (![200, 404].includes(res.status)) {
    console.log('getData', { status: res.status, resbody: res.body });
  }

  check(res, {
    ['GET /v1/${path status is 200 or 404']: (r) =>
      r.status === 200 || r.status === 404,
  });

  return res;
}

export function getIdentity(
  service: string,
  id: string,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/identity/${service}/${id}`);
  const headers = signedHeaders('GET', url);
  const res = http.get(url, { headers, responseCallback: okOrNotFound });

  if (![200, 404].includes(res.status)) {
    console.log('getIdentity', { status: res.status, resbody: res.body });
  }

  check(res, {
    [`GET identity v1/identity/${service}/${id} status is 200 or 404`]: (r) =>
      r.status === 200 || r.status === 404,
  });

  return res;
}

export function getLinkedIdentity(
  service: string,
  headers?: Record<string, string>,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/identity/exchange?requiredService=${service}`);
  const reqHeaders = mergeHeaders(signedHeaders('GET', url), headers);
  const res = http.get(url, {
    headers: reqHeaders,
    responseCallback: okOrNotFound,
  });

  if (![200, 404].includes(res.status)) {
    console.log('getIdentity', { status: res.status, resbody: res.body });
  }

  check(res, {
    [`GET identity v1/identity/exchange?requiredService=${service} status is 200 or 404`]:
      (r) => r.status === 200 || r.status === 404,
  });

  return res;
}

export function postData(
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/${path}`);
  const reqHeaders = mergeHeaders(signedHeaders('POST', url, body), headers);
  const res = http.post(url, JSON.stringify(body), { headers: reqHeaders });

  if (![200].includes(res.status)) {
    console.log('postData', { status: res.status, resbody: res.body });
  }

  check(res, {
    [`POST data /v1/${path} status is 200`]: (r) => r.status === 200,
  });

  return res;
}

export function patchData(
  path: string,
  body: Record<string, unknown>,
  headers?: Record<string, string>,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/${path}`);
  const reqHeaders = mergeHeaders(signedHeaders('PATCH', url, body), headers);
  const res = http.patch(url, JSON.stringify(body), {
    headers: reqHeaders,
    responseCallback: okOrNotFound,
  });
  if (![200, 404].includes(res.status)) {
    console.log('patchData', { status: res.status, resbody: res.body });
  }
  check(res, {
    [`PATCH data /v1/{path} status is 200  or 404`]: (r) =>
      r.status === 200 || r.status === 404,
  });

  return res;
}

export function postIdentity(
  service: string,
  id: string,
  body: Record<string, unknown>,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/identity/${service}/${id}`);
  const headers = signedHeaders('POST', url, body);
  const res = http.post(url, JSON.stringify(body), { headers });

  if (![200].includes(res.status)) {
    console.log('postIdentity', { status: res.status, resbody: res.body });
  }

  check(res, {
    [`POST identity /v1/identity/${service}/${id} status is 200 `]: (r) =>
      r.status === 200,
  });

  return res;
}

export function postUser(
  body: Record<string, unknown>,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/user`);
  const headers = signedHeaders('POST', url, body);
  const res = http.post(url, JSON.stringify(body), {
    headers,
    responseCallback: okOrNoContent,
  });

  if (![200, 204].includes(res.status)) {
    console.log('postUser', { status: res.status, resbody: res.body, body });
  }

  check(res, {
    [`POST user /v1/user status is 200 or 204`]: (r) =>
      r.status === 200 || r.status === 204,
  });

  return res;
}

export function deleteData(
  path: string,
  headers?: Record<string, string>,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/${path}`);
  const reqHeaders = mergeHeaders(signedHeaders('DELETE', url), headers);
  const res = http.del(url, null, {
    headers: reqHeaders,
    responseCallback: okOrNotFound,
  });

  if (![200, 404].includes(res.status)) {
    console.log('deleteData', { status: res.status, resbody: res.body });
  }
  check(res, {
    [`DELETE data /v1/{path} status is 200  or 404`]: (r) =>
      r.status === 200 || r.status === 404,
  });

  return res;
}

export function deleteIdentity(
  service: string,
  id: string,
): RefinedResponse<ResponseType> {
  const url = buildUrl(`/v1/identity/${service}/${id}`);
  const headers = signedHeaders('DELETE', url);
  const res = http.del(url, null, { headers, responseCallback: okOrNotFound });

  if (![200, 404].includes(res.status)) {
    console.log('deleteIdentity', { status: res.status, resbody: res.body });
  }

  check(res, {
    [`DELETE identity /v1/identity/${service}/${id} status is 200 or 404`]: (
      r,
    ) => r.status === 200 || r.status === 404,
  });

  return res;
}
