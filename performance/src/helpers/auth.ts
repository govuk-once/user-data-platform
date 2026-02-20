import crypto from 'k6/crypto';
import encoding from 'k6/encoding';
import { config } from '../config';

const credentials = {
  accessKeyId: __ENV.AWS_ACCESS_KEY_ID,
  secretAccessKey: __ENV.AWS_SECRET_ACCESS_KEY,
  sessionToken: __ENV.AWS_SESSION_TOKEN || undefined,
};

function parseUrl(url: string) {
  const match = url.match(/^(https?):\/\/([^/:]+)(:\d+)?(\/[^?]*)?(\?.*)?$/);
  if (!match) throw new Error(`Invalid URL: ${url}`);
  const hostname = match[2];
  const port = match[3] ? match[3].slice(1) : '';
  const pathname = match[4] || '/';
  const search = match[5] || '';
  const host = port ? `${hostname}:${port}` : hostname;
  return { hostname, host, pathname, search };
}

function hmacBase64(key: string | ArrayBuffer, data: string): ArrayBuffer {
  const b64 = crypto.hmac('sha256', key, data, 'base64');
  return encoding.b64decode(b64);
}

function sha256Hex(data: string): string {
  return crypto.sha256(data, 'hex');
}

function getSignatureKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string,
): ArrayBuffer {
  const kDate = hmacBase64(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmacBase64(kDate, region);
  const kService = hmacBase64(kRegion, service);
  return hmacBase64(kService, 'aws4_request');
}

function toAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '');
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

export function signedHeaders(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): Record<string, string> {
  const parsedUrl = parseUrl(url);
  const bodyStr = body ? JSON.stringify(body) : '';
  const { amzDate, dateStamp } = toAmzDate(new Date());
  const region = config.awsRegion;
  const service = 'execute-api';

  const canonicalEntries: [string, string][] = [
    ['accept', 'application/json'],
    ['content-type', 'application/json'],
    ['host', parsedUrl.host],
    ['x-amz-date', amzDate],
  ];

  if (credentials.sessionToken) {
    canonicalEntries.push(['x-amz-security-token', credentials.sessionToken]);
    canonicalEntries.sort((a, b) => a[0].localeCompare(b[0]));
  }

  const signedHeadersStr = canonicalEntries.map(([k]) => k).join(';');
  const canonicalHeaders =
    canonicalEntries.map(([k, v]) => `${k}:${v.trim()}`).join('\n') + '\n';

  const payloadHash = sha256Hex(bodyStr);
  const canonicalQuerystring = parsedUrl.search
    ? parsedUrl.search.slice(1)
    : '';

  const canonicalRequest = [
    method,
    parsedUrl.pathname,
    canonicalQuerystring,
    canonicalHeaders,
    signedHeadersStr,
    payloadHash,
  ].join('\n');

  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;

  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join('\n');

  const signingKey = getSignatureKey(
    credentials.secretAccessKey,
    dateStamp,
    region,
    service,
  );

  const signature = crypto.hmac('sha256', signingKey, stringToSign, 'hex');

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  const result: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    host: parsedUrl.host,
    'x-amz-date': amzDate,
    Authorization: authorization,
    'x-api-key': config.apiKey,
  };

  if (credentials.sessionToken) {
    result['x-amz-security-token'] = credentials.sessionToken;
  }

  return result;
}
