import {
  AWSConfig,
  SignatureV4,
} from 'https://jslib.k6.io/aws/0.14.0/signature.js';

import { config } from '../config';

const awsConfig = new AWSConfig({
  region: config.awsRegion,
  accessKeyId: __ENV.AWS_ACCESS_KEY_ID,
  secretAccessKey: __ENV.AWS_SECRET_ACCESS_KEY,
  sessionToken: __ENV.AWS_SESSION_TOKEN || undefined,
});

const signer = new SignatureV4({
  service: 'execute-api',
  region: awsConfig.region,
  credentials: {
    accessKeyId: awsConfig.accessKeyId,
    secretAccessKey: awsConfig.secretAccessKey,
    sessionToken: awsConfig.sessionToken,
  },
});

function parseUrl(url: string) {
  const match = url.match(/^(https?:)\/\/([^/:]+)(:\d+)?(\/[^?]*)?(\?.*)?$/);
  if (!match) throw new Error(`Invalid URL: ${url}`);
  const protocol = match[1];
  const hostname = match[2];
  const port = match[3] ? match[3].slice(1) : '';
  const pathname = match[4] || '/';
  const search = match[5] || '';
  const host = port ? `${hostname}:${port}` : hostname;
  return { protocol, hostname, host, pathname, search };
}

export function signedHeaders(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): Record<string, string> {
  const parsedUrl = parseUrl(url);

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    host: parsedUrl.host,
  };

  if (body) {
    headers['content-length'] = String(JSON.stringify(body).length);
  }

  const signed = signer.sign({
    method,
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    path: parsedUrl.pathname + parsedUrl.search,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return {
    ...signed.headers,
    'x-api-key': config.apiKey,
  };
}
