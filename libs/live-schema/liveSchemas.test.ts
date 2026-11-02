import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { DsqlConnection } from './dsql';
import { LiveSchemaRepository, nextSchemaVersion } from './liveSchemas';
import { inferSchema } from './shape';
import { toDcatDistribution } from './dcat';

const NOW = new Date('2026-09-20T13:21:55.000Z');

describe('nextSchemaVersion', () => {
  it.each([
    ['1.1', '1.2'],
    ['1.9', '2.0'],
    ['2.0', '2.1'],
  ])('%s -> %s', (from, to) => {
    expect(nextSchemaVersion(from)).toBe(to);
  });
});

describe('LiveSchemaRepository', () => {
  const query = vi.fn();
  const repository = new LiveSchemaRepository(
    { query } as unknown as DsqlConnection,
    () => NOW,
  );

  const latestRow = (version: string, payload: unknown) => ({
    rowCount: 1,
    rows: [
      {
        version,
        dcatSchema: toDcatDistribution(
          '/dvla/state',
          version,
          NOW,
          inferSchema(payload),
        ),
      },
    ],
  });
  const none = { rowCount: 0, rows: [] };
  const inserts = () =>
    query.mock.calls.filter(([sql]) => (sql as string).includes('INSERT'));

  beforeEach(() => query.mockReset());

  it('saves an unseen key as 1.1 in DCAT form', async () => {
    query.mockResolvedValueOnce(none).mockResolvedValueOnce({ rowCount: 1 });

    const result = await repository.evolve(
      '/dvla/state',
      inferSchema({ vehicleRegistration: 'x', motExpiry: '2027-01-01' }),
    );

    expect(result).toEqual({ version: '1.1', created: true });
    const [, [udpKey, version, dateSaved, dcatSchema]] = inserts()[0];
    expect([udpKey, version, dateSaved]).toEqual(['/dvla/state', '1.1', NOW]);
    expect(JSON.parse(dcatSchema)).toMatchObject({
      '@type': 'dcat:Distribution',
      'dct:identifier': '/dvla/state@1.1',
      'dct:issued': NOW.toISOString(),
      schemaDefinition: {
        $schema: 'http://json-schema.org/draft-07/schema#',
        type: 'object',
        properties: {
          vehicleRegistration: { type: 'string' },
          motExpiry: { type: 'string', format: 'date' },
        },
      },
    });
  });

  it('returns the current version without writing when the shape is known', async () => {
    query.mockResolvedValueOnce(latestRow('1.3', { a: 1, b: 'x' }));

    const result = await repository.evolve(
      '/dvla/state',
      inferSchema({ a: 2, b: 'y' }),
    );

    expect(result).toEqual({ version: '1.3', created: false });
    expect(inserts()).toHaveLength(0);
  });

  it('writes the next version with new fields appended', async () => {
    query
      .mockResolvedValueOnce(latestRow('1.1', { vehicleRegistration: 'x' }))
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await repository.evolve(
      '/dvla/state',
      inferSchema({ vehicleRegistration: 'y', sornStatus: 'none' }),
    );

    expect(result).toEqual({ version: '1.2', created: true });
    const stored = JSON.parse(inserts()[0][1][3]);
    expect(Object.keys(stored.schemaDefinition.properties).sort()).toEqual([
      'sornStatus',
      'vehicleRegistration',
    ]);
  });

  it('re-reads and folds in a concurrent writer that took the version first', async () => {
    query
      .mockResolvedValueOnce(latestRow('1.1', { a: 1 }))
      .mockResolvedValueOnce({ rowCount: 0 }) // 1.2 taken
      .mockResolvedValueOnce(latestRow('1.2', { a: 1, b: 'x' }))
      .mockResolvedValueOnce({ rowCount: 1 });

    const result = await repository.evolve(
      '/k',
      inferSchema({ a: 1, c: true }),
    );

    expect(result).toEqual({ version: '1.3', created: true });
    const stored = JSON.parse(inserts()[1][1][3]);
    expect(Object.keys(stored.schemaDefinition.properties).sort()).toEqual([
      'a',
      'b',
      'c',
    ]);
  });

  it('parses dcatSchema returned as text', async () => {
    const row = latestRow('1.1', { a: 1 });
    query.mockResolvedValueOnce({
      ...row,
      rows: [
        { ...row.rows[0], dcatSchema: JSON.stringify(row.rows[0].dcatSchema) },
      ],
    });

    await expect(repository.getLatest('/dvla/state')).resolves.toMatchObject({
      version: '1.1',
      schema: { properties: { a: { type: 'integer' } } },
    });
  });
});
