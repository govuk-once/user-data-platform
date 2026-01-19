import { getAccessToken } from './auth.js';
import { config } from './config.js';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  body: T;
  ok: boolean;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATHCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  authenticated?: boolean;
  timeout?: number;
}

const DEBUG = process.env.DEBUG === 'true' || process.env.DEBUG === '1';

export class ApiClient {
  private baseUrl: string;
  private clientName: string;

  constructor(baseUrl: string = config.apiBaseUrl, clientName?: string) {
    this.baseUrl = baseUrl;
    this.clientName = clientName || config.cognito.defaultClient;
  }

  getClientName(): string {
    return this.clientName;
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
      timeout = 25000,
    } = options;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'Cache-Control': 'max-age=0',
      ...headers,
    };

    if (authenticated) {
      const token = await getAccessToken(this.clientName);
      requestHeaders.Authorization = `Bearer ${token}`;
    }

    const normalizedBase = this.baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${normalizedBase}${normalizedPath}`;

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
