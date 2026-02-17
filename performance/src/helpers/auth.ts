import { AWSConfig, SignatureV4 } from 'k6/experimental/aws';

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

export function signedHeaders(
  method: string,
  url: string,
  body?: Record<string, unknown>,
): Record<string, string> {
  const parsedUrl = new URL(url);

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
