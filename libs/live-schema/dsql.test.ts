import { vi, describe, it, expect } from 'vitest';
import type { Client } from 'pg';
import { DsqlConnection } from './dsql';

const config = {
  endpoint: 'abc.dsql.eu-west-2.on.aws',
  region: 'eu-west-2',
  user: 'r',
};

const fakeClient = (query: ReturnType<typeof vi.fn>) =>
  ({
    query,
    on: vi.fn(),
    end: vi.fn().mockResolvedValue(undefined),
  }) as unknown as Client;

describe('DsqlConnection', () => {
  it('reuses one connection across queries', async () => {
    const query = vi.fn().mockResolvedValue({ rowCount: 0, rows: [] });
    const create = vi.fn().mockResolvedValue(fakeClient(query));
    const db = new DsqlConnection(config, create);

    await db.query('SELECT 1');
    await db.query('SELECT 2');

    expect(create).toHaveBeenCalledTimes(1);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('retries optimistic concurrency conflicts', async () => {
    const conflict = Object.assign(new Error('conflict'), { code: '40001' });
    const query = vi
      .fn()
      .mockRejectedValueOnce(conflict)
      .mockResolvedValue({ rowCount: 1, rows: [] });
    const db = new DsqlConnection(
      config,
      vi.fn().mockResolvedValue(fakeClient(query)),
    );

    await expect(db.query('UPDATE x')).resolves.toMatchObject({ rowCount: 1 });
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('gives up after repeated conflicts', async () => {
    const conflict = Object.assign(new Error('conflict'), { code: '40001' });
    const query = vi.fn().mockRejectedValue(conflict);
    const db = new DsqlConnection(
      config,
      vi.fn().mockResolvedValue(fakeClient(query)),
    );

    await expect(db.query('UPDATE x')).rejects.toBe(conflict);
    expect(query).toHaveBeenCalledTimes(4);
  });

  it('reconnects after a connection-level failure', async () => {
    const query = vi
      .fn()
      .mockRejectedValueOnce(new Error('socket hang up'))
      .mockResolvedValue({ rowCount: 0, rows: [] });
    const create = vi.fn().mockResolvedValue(fakeClient(query));
    const db = new DsqlConnection(config, create);

    await expect(db.query('SELECT 1')).rejects.toThrow('socket hang up');
    await db.query('SELECT 1');

    expect(create).toHaveBeenCalledTimes(2);
  });
});
