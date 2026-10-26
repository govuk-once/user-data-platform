import { vi, describe, beforeEach, expect, it } from 'vitest';
import type { Context } from 'aws-lambda';

const ROLE_ARN = 'arn:aws:iam::123456789012:role/schema-extractor';

const { query } = vi.hoisted(() => {
  process.env['DSQL_ENDPOINT'] = 'abc.dsql.eu-west-2.on.aws';
  process.env['AWS_REGION'] = 'eu-west-2';
  process.env['SCHEMA_EXTRACTOR_ROLE_ARN'] =
    'arn:aws:iam::123456789012:role/schema-extractor';
  return { query: vi.fn() };
});

vi.mock('@aws-sdk/dsql-signer', () => ({
  DsqlSigner: vi.fn().mockImplementation(function () {
    return {
      getDbConnectAdminAuthToken: vi.fn().mockResolvedValue('token'),
      getDbConnectAuthToken: vi.fn().mockResolvedValue('token'),
    };
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

import { Client } from 'pg';
import {
  LIVE_SCHEMAS_TABLE,
  SCHEMA_EXTRACTOR_DB_ROLE,
  TABLE_DDL,
} from '@libs/live-schema';
import { handler } from './handler';

const context = { functionName: 'liveSchemaMigration' } as Context;

const sql = () => query.mock.calls.map(([text]) => text as string);
const callsMatching = (fragment: string) =>
  sql().filter((text) => text.includes(fragment));

/** Routes each catalogue lookup to a canned result; everything else succeeds. */
const respond = ({ roleExists = false, mappedArns = [] as string[] } = {}) =>
  query.mockImplementation(async (text: string) => {
    if (text.includes('pg_roles')) {
      return { rowCount: roleExists ? 1 : 0, rows: [] };
    }
    if (text.includes('iam_pg_role_mappings')) {
      return {
        rowCount: mappedArns.length,
        rows: mappedArns.map((arn) => ({ arn })),
      };
    }
    return { rowCount: 0, rows: [] };
  });

describe('liveSchemaMigrationLambda handler', () => {
  beforeEach(() => {
    query.mockReset();
  });

  it('creates tables, the extractor role and its IAM mapping as admin', async () => {
    respond();

    await handler(undefined, context);

    expect(Client).toHaveBeenCalledWith(
      expect.objectContaining({ user: 'admin' }),
    );
    for (const ddl of TABLE_DDL) {
      expect(sql()).toContain(ddl);
    }
    expect(sql()).toContain(
      `CREATE ROLE ${SCHEMA_EXTRACTOR_DB_ROLE} WITH LOGIN`,
    );
    expect(callsMatching(`ON ${LIVE_SCHEMAS_TABLE} TO`)).toHaveLength(1);
    expect(sql()).toContain(
      `AWS IAM GRANT ${SCHEMA_EXTRACTOR_DB_ROLE} TO '${ROLE_ARN}'`,
    );
  });

  it('is idempotent against an already-migrated cluster', async () => {
    respond({ roleExists: true, mappedArns: [ROLE_ARN] });

    await handler(undefined, context);

    expect(callsMatching('CREATE ROLE')).toHaveLength(0);
    expect(callsMatching('AWS IAM GRANT')).toHaveLength(0);
    expect(callsMatching('AWS IAM REVOKE')).toHaveLength(0);
  });

  it('revokes IAM mappings left by a replaced execution role', async () => {
    const stale = 'arn:aws:iam::123456789012:role/old-extractor';
    respond({ roleExists: true, mappedArns: [stale] });

    await handler(undefined, context);

    expect(sql()).toContain(
      `AWS IAM GRANT ${SCHEMA_EXTRACTOR_DB_ROLE} TO '${ROLE_ARN}'`,
    );
    expect(sql()).toContain(
      `AWS IAM REVOKE ${SCHEMA_EXTRACTOR_DB_ROLE} FROM '${stale}'`,
    );
  });
});
