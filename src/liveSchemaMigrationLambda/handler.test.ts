import { vi, describe, beforeEach, expect, it } from 'vitest';
import type { Context, DynamoDBStreamEvent } from 'aws-lambda';
import { marshall } from '@aws-sdk/util-dynamodb';

const { query } = vi.hoisted(() => {
  process.env['DSQL_ENDPOINT'] = 'abc.dsql.eu-west-2.on.aws';
  process.env['AWS_REGION'] = 'eu-west-2';
  return { query: vi.fn() };
});

vi.mock('@aws-sdk/dsql-signer', () => ({
  DsqlSigner: vi.fn().mockImplementation(function () {
    return { getDbConnectAuthToken: vi.fn().mockResolvedValue('token') };
  }),
}));

vi.mock('pg', () => ({
  Client: vi.fn().mockImplementation(function () {
    return { connect: vi.fn(), on: vi.fn(), end: vi.fn(), query };
  }),
}));

import { Client } from 'pg';
import { hashUdpId } from '@libs/live-schema';
import { handler } from './handler';

const context = { functionName: 'liveUserSchemaExtractor' } as Context;

type Change = {
  name: 'INSERT' | 'MODIFY' | 'REMOVE';
  pk?: string;
  sk: string;
  data?: object;
};

const event = (records: Change[]) =>
  ({
    Records: records.map(({ name, pk = 'udp-1', sk, data }) => ({
      eventName: name,
      dynamodb: {
        ApproximateCreationDateTime: 1_700_000_000,
        Keys: { pk: { S: pk }, sk: { S: sk } },
        ...(data && {
          NewImage: {
            pk: { S: pk },
            sk: { S: sk },
            data: { M: marshall(data) },
          },
        }),
      },
    })),
  }) as unknown as DynamoDBStreamEvent;

const callsMatching = (fragment: string) =>
  query.mock.calls.filter(([sql]) => (sql as string).includes(fragment));

describe('liveUserSchemaExtractorLambda handler', () => {
  beforeEach(() => {
    query.mockReset().mockResolvedValue({ rowCount: 1, rows: [] });
  });

  it('upserts the pseudonymised user footprint as its own DB role', async () => {
    await handler(
      event([{ name: 'INSERT', sk: 'profile', data: { a: 1 } }]),
      context,
    );

    expect(Client).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'live_user_schema_extractor' }),
    );
    const [[, values]] = callsMatching('INSERT INTO live_user_schemas');
    expect(values).toEqual([
      hashUdpId('udp-1'),
      new Date(1_700_000_000_000),
      '{"profile":{"a":["number"]}}',
    ]);
    expect(JSON.stringify(query.mock.calls)).not.toContain('"udp-1"');
  });

  it('drops the topic from the footprint when the record is removed', async () => {
    await handler(event([{ name: 'REMOVE', sk: 'profile' }]), context);

    const [[, values]] = callsMatching('UPDATE live_user_schemas');
    expect(values.slice(0, 2)).toEqual([hashUdpId('udp-1'), ['profile']]);
    expect(callsMatching('DELETE FROM live_user_schemas')).toHaveLength(1);
    expect(callsMatching('INSERT')).toHaveLength(0);
  });

  it('collapses a batch to the last change per user and topic', async () => {
    await handler(
      event([
        { name: 'INSERT', sk: 'profile', data: { a: 1 } },
        { name: 'REMOVE', sk: 'profile' },
        { name: 'INSERT', sk: 'vehicles', data: { v: true } },
        { name: 'MODIFY', pk: 'udp-2', sk: 'profile', data: { a: 1 } },
        { name: 'MODIFY', pk: 'udp-2', sk: 'profile', data: { b: 'x' } },
      ]),
      context,
    );

    const [[, upserted]] = callsMatching('INSERT INTO live_user_schemas');
    expect(upserted).toEqual([
      hashUdpId('udp-1'),
      new Date(1_700_000_000_000),
      '{"vehicles":{"v":["boolean"]}}',
      hashUdpId('udp-2'),
      new Date(1_700_000_000_000),
      '{"profile":{"b":["string"]}}',
    ]);

    const [[, removed]] = callsMatching('UPDATE live_user_schemas');
    expect(removed.slice(0, 2)).toEqual([hashUdpId('udp-1'), ['profile']]);
  });
});
