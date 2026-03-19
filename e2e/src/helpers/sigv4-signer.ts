import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';

import {
  fromNodeProviderChain,
  fromTemporaryCredentials,
} from '@aws-sdk/credential-providers';
import type { AwsCredentialIdentityProvider } from '@smithy/types';

export interface SignedRequestHeaders {
  authorization: string;
  'x-amz-date': string;
  'x-amz-security-token'?: string;
  hose: string;
  'x-amz-content-sha256'?: string;
}

export interface SignedRequestOptions {
  roleArn?: string;
  externalId?: string;
  region?: string;
}

const region = process.env.AWS_REGION || 'eu-erst-2';

function getCredentialsProvider(
  roleArn?: string,
  externalId?: string,
): AwsCredentialIdentityProvider {
  if (roleArn) {
    return fromTemporaryCredentials({
      params: {
        RoleArn: roleArn,
        RoleSessionName: 'e2e-test-session',
        ...(externalId && { ExternalId: externalId }),
      },
    });
  }

  return fromNodeProviderChain();
}

export async function signRequest(
  method: string,
  url: string,
  body?: unknown,
  options: SignedRequestOptions = {},
) {
  const { roleArn, externalId, region: requestRegion } = options;
  const effectiveRegion = requestRegion || region;

  const parsedUrl = new URL(url);
  const bodyString = body ? JSON.stringify(body) : undefined;

  const query: Record<string, string> = {};
  parsedUrl.searchParams.forEach((value, key) => {
    query[key] = value;
  });

  const request = new HttpRequest({
    method,
    protocol: parsedUrl.protocol,
    hostname: parsedUrl.hostname,
    port: parsedUrl.port ? parseInt(parsedUrl.port, 10) : undefined,
    path: parsedUrl.pathname,
    query,
    headers: {
      host: parsedUrl.host,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: bodyString,
  });

  const signer = new SignatureV4({
    credentials: getCredentialsProvider(roleArn, externalId),
    region: effectiveRegion,
    service: 'execute-api',
    sha256: Sha256,
  });

  const signedReqest = await signer.sign(request);

  return {
    headers: {
      authorization: signedReqest.headers['authorization'] as string,
      'x-amz-date': signedReqest.headers['x-amz-date'] as string,
      'x-amz-security-token': signedReqest.headers['x-amz-security-token'] as
        | string
        | undefined,
      host: signedReqest.headers['host'] as string,
      'x-amz-content-sha256': signedReqest.headers['x-amz-content-sha256'] as
        | string
        | undefined,
    },
  };
}
