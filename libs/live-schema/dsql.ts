import { DsqlSigner } from '@aws-sdk/dsql-signer';
import { Client, type QueryResult } from 'pg';

export interface DsqlConfig {
  /** Cluster endpoint, e.g. `<id>.dsql.eu-west-2.on.aws`. */
  endpoint: string;
  region: string;
  /** Postgres role to log in as. `admin` uses DbConnectAdmin auth. */
  user: string;
  connectTimeoutMs?: number;
}

/** DSQL closes connections after 60 minutes; recycle well before that. */
const MAX_CONNECTION_AGE_MS = 45 * 60 * 1000;

/** SQLSTATE raised by DSQL on an optimistic concurrency conflict. */
const SERIALIZATION_FAILURE = '40001';
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lazily connects to Aurora DSQL with an IAM auth token and keeps the
 * connection warm across Lambda invocations. Writes are retried with jittered
 * backoff when DSQL reports an OCC conflict.
 */
export class DsqlConnection {
  private client?: Client;
  private connectedAt = 0;

  constructor(
    private readonly config: DsqlConfig,
    private readonly createClient: (
      config: DsqlConfig,
    ) => Promise<Client> = connect,
  ) {}

  query<R extends object = Record<string, unknown>>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>> {
    return this.attemptQuery<R>(text, values, 1);
  }

  async close(): Promise<void> {
    const client = this.client;
    this.client = undefined;
    await client?.end().catch(() => undefined);
  }

  private async attemptQuery<R extends object>(
    text: string,
    values: unknown[] | undefined,
    attempt: number,
  ): Promise<QueryResult<R>> {
    const client = await this.getClient();
    try {
      return await client.query<R>(text, values);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === SERIALIZATION_FAILURE && attempt < MAX_ATTEMPTS) {
        await sleep(Math.random() * 50 * 2 ** attempt);
        return this.attemptQuery<R>(text, values, attempt + 1);
      }
      if (!code) {
        // Connection-level failure: drop the client so the next call reconnects.
        await this.close();
      }
      throw error;
    }
  }

  private async getClient(): Promise<Client> {
    if (this.client && Date.now() - this.connectedAt > MAX_CONNECTION_AGE_MS) {
      await this.close();
    }

    if (!this.client) {
      const client = await this.createClient(this.config);
      client.on('error', () => {
        if (this.client === client) this.client = undefined;
      });
      this.client = client;
      this.connectedAt = Date.now();
    }

    return this.client;
  }
}

const connect = async (config: DsqlConfig): Promise<Client> => {
  const signer = new DsqlSigner({
    hostname: config.endpoint,
    region: config.region,
  });

  const password =
    config.user === 'admin'
      ? await signer.getDbConnectAdminAuthToken()
      : await signer.getDbConnectAuthToken();

  const client = new Client({
    host: config.endpoint,
    port: 5432,
    database: 'postgres',
    user: config.user,
    password,
    ssl: { rejectUnauthorized: true },
    connectionTimeoutMillis: config.connectTimeoutMs ?? 10_000,
  });

  await client.connect();
  return client;
};
