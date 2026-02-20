import crypto from 'k6/crypto';
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

function hmac(key: string | ArrayBuffer, data: string): ArrayBuffer {
  return crypto.hmac('sha256', key, data, 'binary');
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
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, 'aws4_request');
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

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    host: parsedUrl.host,
    'x-amz-date': amzDate,
  };

  if (credentials.sessionToken) {
    headers['x-amz-security-token'] = credentials.sessionToken;
  }

  const signedHeaderKeys = Object.keys(headers)
    .map((k) => k.toLowerCase())
    .sort();
  const signedHeadersStr = signedHeaderKeys.join(';');

  const canonicalHeaders =
    signedHeaderKeys
      .map(
        (k) =>
          `${k}:${headers[k] || headers[Object.keys(headers).find((h) => h.toLowerCase() === k)!]}`,
      )
      .join('\n') + '\n';

  const payloadHash = sha256Hex(bodyStr);

  const canonicalPath = parsedUrl.pathname;
  const canonicalQuerystring = parsedUrl.search
    ? parsedUrl.search.slice(1)
    : '';

  const canonicalRequest = [
    method,
    canonicalPath,
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

  const signature = crypto.hexEncode(hmac(signingKey, stringToSign));

  const authorization =
    `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeadersStr}, Signature=${signature}`;

  return {
    ...headers,
    Authorization: authorization,
    'x-api-key': config.apiKey,
  };
}
