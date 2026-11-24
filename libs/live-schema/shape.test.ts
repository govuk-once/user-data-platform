import { describe, it, expect } from 'vitest';
import { inferSchema, mergeSchemas, schemasEqual } from './shape';

describe('inferSchema', () => {
  it('records types, never values', () => {
    expect(
      inferSchema({
        vehicleRegistration: 'AB12 CDE',
        mileage: 42000,
        fuelEconomy: 45.5,
        sorn: false,
        notes: null,
      }),
    ).toEqual({
      type: 'object',
      properties: {
        vehicleRegistration: { type: 'string' },
        mileage: { type: 'integer' },
        fuelEconomy: { type: 'number' },
        sorn: { type: 'boolean' },
        notes: { type: 'null' },
      },
      required: [
        'vehicleRegistration',
        'mileage',
        'fuelEconomy',
        'sorn',
        'notes',
      ],
    });
  });

  it('detects date and date-time string formats', () => {
    expect(inferSchema('2026-09-17')).toEqual({
      type: 'string',
      format: 'date',
    });
    expect(inferSchema('2026-09-17T09:21:55.000Z')).toEqual({
      type: 'string',
      format: 'date-time',
    });
    expect(inferSchema('17/09/2026')).toEqual({ type: 'string' });
  });

  it('describes nested objects and merges array item shapes', () => {
    expect(
      inferSchema({ alerts: [{ id: 'a', route: 'x' }, { id: 'b' }], tags: [] }),
    ).toEqual({
      type: 'object',
      properties: {
        alerts: {
          type: 'array',
          items: {
            type: 'object',
            properties: { id: { type: 'string' }, route: { type: 'string' } },
            required: ['id'],
          },
        },
        tags: { type: 'array' },
      },
      required: ['alerts', 'tags'],
    });
  });
});

describe('mergeSchemas', () => {
  it('appends new fields and keeps only always-present keys required', () => {
    const merged = mergeSchemas(
      inferSchema({ vehicleRegistration: 'x', taxStatus: 'Taxed' }),
      inferSchema({ vehicleRegistration: 'y', sornStatus: 'none' }),
    );

    expect(merged).toEqual({
      type: 'object',
      properties: {
        sornStatus: { type: 'string' },
        taxStatus: { type: 'string' },
        vehicleRegistration: { type: 'string' },
      },
      required: ['vehicleRegistration'],
    });
  });

  it('widens integer to number and unions conflicting types', () => {
    expect(mergeSchemas({ type: 'integer' }, { type: 'number' })).toEqual({
      type: 'number',
    });
    expect(mergeSchemas({ type: 'string' }, { type: 'integer' })).toEqual({
      type: ['integer', 'string'],
    });
  });

  it('drops a string format once a value without it is seen', () => {
    expect(
      mergeSchemas(inferSchema('2026-09-17'), inferSchema('not a date')),
    ).toEqual({ type: 'string' });
    expect(
      mergeSchemas(inferSchema('2026-09-17'), inferSchema('2026-10-01')),
    ).toEqual({ type: 'string', format: 'date' });
  });

  it('keeps nested required keys when a value is sometimes null', () => {
    expect(
      mergeSchemas(inferSchema({ a: 1 }), inferSchema(null)).required,
    ).toEqual(['a']);
  });
});

describe('schemasEqual', () => {
  it('ignores key and array ordering', () => {
    const a = inferSchema({ b: 1, a: 'x' });
    const b = inferSchema({ a: 'y', b: 2 });
    expect(schemasEqual(a, b)).toBe(true);
  });

  it('is stable: merging a payload already described changes nothing', () => {
    const existing = mergeSchemas(
      inferSchema({ a: 1, b: 'x' }),
      inferSchema({ a: 2 }),
    );
    expect(
      schemasEqual(mergeSchemas(existing, inferSchema({ a: 3 })), existing),
    ).toBe(true);
  });

  it('detects a new field', () => {
    const existing = inferSchema({ a: 1 });
    expect(
      schemasEqual(
        mergeSchemas(existing, inferSchema({ a: 1, c: true })),
        existing,
      ),
    ).toBe(false);
  });
});
