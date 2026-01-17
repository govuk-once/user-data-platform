import { config, getCognitoClient } from './config.js';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache: Map<string, CachedToken> = new Map();

export async function getAccessToken(clientName?: string): Promise<string> {
  const resolvedClientName = clientName || config.cognito.defaultClient;

  const cached = tokenCache.get(resolvedClientName);
  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  const clientConfig = getCognitoClient(resolvedClientName);
  const { tokenEndpoint } = config.cognito;

  const credentials = Buffer.from(
    `${clientConfig.clientId}:${clientConfig.clientSecret}`,
  ).toString('base64');

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientConfig.clientId,
      scope: clientConfig.scopes.join(' '),
    }),
  });

  console.log({ response });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to get access token for client "${resolvedClientName}": ${errorText}`,
    );
  }

  const tokenResponse: TokenResponse =
    (await response.json()) as unknown as TokenResponse;

  tokenCache.set(resolvedClientName, {
    accessToken: tokenResponse.access_token,
    expiresAt: Date.now() + tokenResponse.expires_in * 1000,
  });

  return tokenResponse.access_token;
}

export function clearTokenCache(clientName?: string): void {
  if (clientName) {
    tokenCache.delete(clientName);
  } else {
    tokenCache.clear();
  }
}
