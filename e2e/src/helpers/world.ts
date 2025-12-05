import { IWorldOptions, setWorldConstructor, World } from '@cucumber/cucumber';
import { ApiClient, ApiResponse } from './api-client.js';
import { config } from './config.js';

export interface CustomWorldParams {
  debug?: boolean;
}

export class CustomWorld extends World<CustomWorldParams> {
  /** API client for making requests */
  public api: ApiClient;

  public lastResponse: ApiResponse | null = null;

  public context: Record<string, unknown> = {};

  public currentClient: string;

  public authenticated: boolean = true;

  constructor(options: IWorldOptions<CustomWorldParams>) {
    super(options);
    this.currentClient = config.cognito.defaultClient;
    this.api = new ApiClient(config.apiBaseUrl, this.currentClient);
  }

  setClient(clietName: string): void {
    this.currentClient = clietName;
    this.authenticated = true;
    this.api = new ApiClient(config.apiBaseUrl, clietName);
  }

  disableAuth(): void {
    this.authenticated = false;
  }

  enableAuth(): void {
    this.authenticated = true;
  }

  storeResponse(response: ApiResponse): void {
    this.lastResponse = response;
  }

  setContext(key: string, value: unknown): void {
    this.context[key] = value;
  }

  getContext<T = unknown>(key: string): T | undefined {
    return this.context[key] as T | undefined;
  }
}


setWorldConstructor(CustomWorld)