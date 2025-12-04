import { getAccessToken } from './auth.js';
import { config } from './config.js';

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Headers;
  data: T;
  ok: boolean;
}

export interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATHCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  authenticated?: boolean;
}

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
    } = options;


    const requestHeadeers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (authenticated) {
      const token = await getAccessToken(this.clientName);
      requestHeadeers.Authorization = `Bearer ${token}`;
    }

    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method,
      headers: requestHeadeers,
      body: body ? JSON.stringify(body) : undefined,
    });

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
      data,
      ok: response.ok,
    };
  }

  get<T = unknown>(
    path: string,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  post<T = unknown>(
    path: string,
    body: unknown,
    options?: Omit<ApiRequestOptions, 'method' | 'body'>,
  ): Promise<ApiResponse<T>> {
    return this.request<T>(path, { ...options, method: 'POST', body });
  }
}
