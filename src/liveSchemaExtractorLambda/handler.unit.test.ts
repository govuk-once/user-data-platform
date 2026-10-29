import { vi, describe, beforeEach, expect, it } from 'vitest';
import type { Context, DynamoDBRecord, DynamoDBStreamEvent } from 'aws-lambda';

const { query } = vi.hoisted(() => {
  process.env['DSQL_ENDPOINT'] = 'abc.dsql.eu-west-2.on.aws';
  process.env['AWS_REGION'] = 'eu-west-2';
  process.env['DATA_TABLE_NAME'] = 'udp-data-test';
  process.env['KMS_KEY_ID'] = 'test-key';
  return { query: vi.fn() };
});

vi.mock('@aws-sdk/dsql-signer', () => ({
  DsqlSigner: vi.fn().mockImplementation(function () {
    return { getDbConnectAuthToken: vi.fn().mockResolvedValue('token') };
  }),
}));

vi.mock('pg', () => ({
  Client: vi.fn().mockImplementation(function () {
    return {
      connect: vi.fn(),
      on: vi.fn(),
      end: vi.fn().mockResolvedValue(undefined),
      query,
    };
  }),
}));

import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBDocumentClient, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { marshall } from '@aws-sdk/util-dynamodb';
import { Client } from 'pg';
import { EncryptionService } from '@libs/data-access';
import { SCHEMA_EXTRACTOR_DB_ROLE } from '@libs/live-schema';
import { handler } from './handler';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const kmsMock = mockClient(KMSClient);

const DATA_KEY = Buffer.alloc(32, 7);
const context = { functionName: 'liveSchemaExtractor' } as Context;

/** In-memory stand-in for the live_schemas table. */
let store: Map<
  string,
  { udpKey: string; version: string; dcatSchema: unknown }
>;

const fakeDsql = async (sql: string, values: unknown[] = []) => {
  if (sql.startsWith('SELECT')) {
    const [udpKey] = values;
    const rows = [...store.values()]
      .filter((r) => r.udpKey === udpKey)
      .sort((a, b) => Number(b.version) - Number(a.version))
      .slice(0, 1);
    return { rowCount: rows.length, rows };
  }
  if (sql.startsWith('INSERT')) {
    const [udpKey, version, , dcatSchema] = values as string[];
    const key = `${udpKey}@${version}`;
    if (store.has(key)) return { rowCount: 0, rows: [] };
    store.set(key, { udpKey, version, dcatSchema: JSON.parse(dcatSchema) });
    return { rowCount: 1, rows: [] };
  }
  throw new Error(`unexpected SQL: ${sql}`);
};

const encrypt = (data: Record<string, unknown>) =>
  new EncryptionService({ kmsKeyId: 'test-key' }).encryptFields({ data }, [
    'data',
  ]);

let seq = 0;
const streamRecord = async (
  eventName: 'INSERT' | 'MODIFY',
  sk: string,
  data: Record<string, unknown>,
): Promise<DynamoDBRecord> => {
  const stored = await encrypt(data);
  return {
    eventName,
    dynamodb: {
      SequenceNumber: String(++seq),
      NewImage: marshall({
        pk: 'udp-id-1',
        sk,
        ...stored,
        schemaEvaluationRequired: true,
      }) as DynamoDBRecord['dynamodb']['NewImage'],
    },
  };
};

const invoke = async (...records: DynamoDBRecord[]) =>
  handler({ Records: records } as DynamoDBStreamEvent, context);

const storedProperties = (udpKey: string, version: string) =>
  Object.keys(
    (
      store.get(`${udpKey}@${version}`)!.dcatSchema as {
        schemaDefinition: { properties: object };
      }
    ).schemaDefinition.properties,
  ).sort();

const stamps = () =>
  dynamoMock.commandCalls(UpdateCommand).map((c) => c.args[0].input);

describe('liveSchemaExtractorLambda handler', () => {
  beforeEach(() => {
    store = new Map();
    query.mockReset().mockImplementation(fakeDsql);
    dynamoMock.reset();
    dynamoMock.on(UpdateCommand).resolves({});
    kmsMock.reset();
    kmsMock.on(GenerateDataKeyCommand).resolves({
      Plaintext: DATA_KEY,
      CiphertextBlob: Buffer.from('wrapped'),
    });
    kmsMock.on(DecryptCommand).resolves({ Plaintext: DATA_KEY });
  });

  describe('INSERT', () => {
    it('decrypts the payload and saves an unseen schema as 1.1', async () => {
      const record = await streamRecord('INSERT', 'dvla/state', {
        vehicleRegistration: 'AB12 CDE',
        taxStatus: 'Taxed',
        motExpiry: '2027-03-01',
      });

      const result = await invoke(record);

      expect(result).toEqual({ batchItemFailures: [] });
      expect(Client).toHaveBeenCalledWith(
        expect.objectContaining({ user: SCHEMA_EXTRACTOR_DB_ROLE }),
      );
      expect([...store.keys()]).toEqual(['/dvla/state@1.1']);
      expect(store.get('/dvla/state@1.1')!.dcatSchema).toMatchObject({
        '@type': 'dcat:Distribution',
        schemaDefinition: {
          properties: {
            vehicleRegistration: { type: 'string' },
            taxStatus: { type: 'string' },
            motExpiry: { type: 'string', format: 'date' },
          },
        },
      });
    });

    it('never stores payload values', async () => {
      await invoke(
        await streamRecord('INSERT', 'dvla/state', {
          vehicleRegistration: 'AB12 CDE',
        }),
      );

      expect(JSON.stringify([...store.values()])).not.toContain('AB12 CDE');
    });

    it('stamps the record with the version and clears the flag', async () => {
      const record = await streamRecord('INSERT', 'app/user-preferences', {
        theme: 'dark',
      });
      const storedData = record.dynamodb!.NewImage!.data.S;

      await invoke(record);

      expect(stamps()).toEqual([
        expect.objectContaining({
          TableName: 'udp-data-test',
          Key: { pk: 'udp-id-1', sk: 'app/user-preferences' },
          UpdateExpression: 'SET #schemaVersion = :version, #flag = :evaluated',
          ConditionExpression: 'attribute_exists(pk) AND #data = :data',
          ExpressionAttributeValues: {
            ':version': '1.1',
            ':evaluated': false,
            ':data': storedData,
          },
        }),
      ]);
    });
  });

  describe('MODIFY', () => {
    it('saves 1.2 with the new field appended when the shape changes', async () => {
      await invoke(
        await streamRecord('INSERT', 'dvla/state', {
          vehicleRegistration: 'AB12 CDE',
          taxStatus: 'Taxed',
        }),
      );

      await invoke(
        await streamRecord('MODIFY', 'dvla/state', {
          vehicleRegistration: 'AB12 CDE',
          taxStatus: 'SORN',
          sornStatus: 'declared',
        }),
      );

      expect([...store.keys()]).toEqual(['/dvla/state@1.1', '/dvla/state@1.2']);
      expect(storedProperties('/dvla/state', '1.1')).toEqual([
        'taxStatus',
        'vehicleRegistration',
      ]);
      expect(storedProperties('/dvla/state', '1.2')).toEqual([
        'sornStatus',
        'taxStatus',
        'vehicleRegistration',
      ]);
      expect(stamps().at(-1)!.ExpressionAttributeValues![':version']).toBe(
        '1.2',
      );
    });

    it('keeps the current version when the shape is unchanged', async () => {
      await invoke(
        await streamRecord('INSERT', 'dvla/state', { taxStatus: 'Taxed' }),
      );
      await invoke(
        await streamRecord('MODIFY', 'dvla/state', { taxStatus: 'SORN' }),
      );

      expect([...store.keys()]).toEqual(['/dvla/state@1.1']);
      expect(stamps().at(-1)!.ExpressionAttributeValues![':version']).toBe(
        '1.1',
      );
    });

    it('skips the stamp when the record changed after the event', async () => {
      dynamoMock.on(UpdateCommand).rejects(
        Object.assign(new Error('conditional'), {
          name: 'ConditionalCheckFailedException',
        }),
      );

      const result = await invoke(
        await streamRecord('MODIFY', 'dvla/state', { taxStatus: 'Taxed' }),
      );

      expect(result).toEqual({ batchItemFailures: [] });
      expect(store.size).toBe(1);
    });
  });

  it('writes one version per key for a batch of records', async () => {
    await invoke(
      await streamRecord('INSERT', 'dvla/state', { a: 1 }),
      await streamRecord('MODIFY', 'dvla/state', { a: 1, b: 'x' }),
      await streamRecord('INSERT', 'travel-alerts', { route: 'M1' }),
    );

    expect([...store.keys()].sort()).toEqual([
      '/dvla/state@1.1',
      '/travel-alerts@1.1',
    ]);
    expect(storedProperties('/dvla/state', '1.1')).toEqual(['a', 'b']);
    expect(stamps()).toHaveLength(3);
  });

  it('reports only the failing key as batch item failures', async () => {
    const good = await streamRecord('INSERT', 'travel-alerts', { route: 'M1' });
    const bad = await streamRecord('INSERT', 'dvla/state', { a: 1 });
    query.mockImplementation(async (sql: string, values: unknown[]) => {
      if (values?.[0] === '/dvla/state') throw new Error('dsql down');
      return fakeDsql(sql, values);
    });

    const result = await invoke(good, bad);

    expect(result).toEqual({
      batchItemFailures: [{ itemIdentifier: bad.dynamodb!.SequenceNumber }],
    });
    expect(store.has('/travel-alerts@1.1')).toBe(true);
  });
});
