import { signRequest, SignedRequestOptions } from './sigv4-signer';
import { config } from './config.js';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  ok: boolean;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  authenticated?: boolean;
  timeout?: number;
  roleArn?: string;
  externalId?: string;
}

const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

export class ApiClient {
  private baseUrl: string;
  private defaultRoleArn?: string;
  private defaultExternalId?: string;

  constructor(
    baseUrl: string = config.apiBaseUrl,
    roleArn?: string,
    externalId?: string,
  ) {
    this.baseUrl = baseUrl;
    this.defaultRoleArn = roleArn;
    this.defaultExternalId = externalId;
  }

  async request<T = unknown>(
    path: string,
    options: ApiRequestOptions = {},
  ): Promise<ApiResponse<T>> {
    const {
      method = 'GET',
      body,
      headers = {},
      authenticated = true,
      roleArn = this.defaultRoleArn,
      externalId = this.defaultExternalId,
      timeout = 25000,
    } = options;

    const normalizedBase = this.baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${normalizedBase}${normalizedPath}`;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Cache-Control': 'max-age=0',
      ...headers,
    };

    if (authenticated) {
      const signOptions: SignedRequestOptions = {
        roleArn,
        externalId,
        region: config.awsRegion,
      };

      const signed = await signRequest(method, url, body, signOptions);

      requestHeaders['Authorization'] = signed.headers.authorization;
      requestHeaders['X-Amz-Date'] = signed.headers['x-amz-date'];

      if (signed.headers['x-amz-security-token']) {
        requestHeaders['X-Amz-Security-Token'] =
          signed.headers['x-amz-security-token'];
      }

      if (signed.headers['x-amz-content-sha256']) {
        requestHeaders['X-Amz-Content-Sha256'] =
          signed.headers['x-amz-content-sha256'];
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      if (DEBUG) console.log(`REquest timed out`);
      controller.abort();
    }, timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: requestHeaders,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`API request timmed out after ${timeout}ms`);
      }
      throw error;
    }
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log({ response });
    }

    let data: T;
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      data = (await response.json()) as unknown as T;
    } else {
      data = (await response.text()) as unknown as T;
    }

    return {
      status: response.status,
      headers: response.headers,
      body: data,
      ok: response.ok,
    };
  }

  get<T = unknown>(
    path: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  delete<T = unknown>(
    path: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  post<T = unknown>(
    path: string,
    body: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }
}
