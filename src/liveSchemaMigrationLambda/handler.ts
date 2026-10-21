import middy from '@middy/core';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  requireEnvVars,
} from '@libs/utils';
import {
  DB_ROLE_GRANTS,
  DsqlConnection,
  EXPECTED_COLUMNS,
  SCHEMA_EXTRACTOR_DB_ROLE,
  TABLE_DDL,
} from '@libs/live-schema';

const { DSQL_ENDPOINT, AWS_REGION, SCHEMA_EXTRACTOR_ROLE_ARN } = requireEnvVars(
  'DSQL_ENDPOINT',
  'AWS_REGION',
  'SCHEMA_EXTRACTOR_ROLE_ARN',
);

const { STACK: stack, SERVICE_NAME: serviceName = 'udpLiveSchemaMigration' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

/**
 * Role names and ARNs are spliced into DDL (Postgres cannot bind identifiers
 * or `AWS IAM GRANT` targets), so both are checked against strict patterns.
 */
const IAM_ROLE_ARN = /^arn:aws[a-z-]*:iam::\d{12}:role\/[\w+=,.@/-]+$/;
const DB_ROLE_NAME = /^[a-z_][a-z0-9_]*$/;

const iamRoleFor: Record<string, string> = {
  [SCHEMA_EXTRACTOR_DB_ROLE]: SCHEMA_EXTRACTOR_ROLE_ARN,
};

const db = new DsqlConnection({
  endpoint: DSQL_ENDPOINT,
  region: AWS_REGION,
  user: 'admin',
});

/**
 * Drops tables left by an earlier, incompatible revision of this stack (see
 * EXPECTED_COLUMNS) so the DDL below recreates them in the current shape.
 */
const dropIncompatibleTables = async () => {
  for (const [table, column] of Object.entries(EXPECTED_COLUMNS)) {
    const { rows } = await db.query<{ column_name: string }>(
      `SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1`,
      [table],
    );
    if (rows.length && !rows.some((r) => r.column_name === column)) {
      logger.warn('Dropping incompatible live schema table', { table });
      await db.query(`DROP TABLE ${table}`);
    }
  }
};

const ensureRole = async (
  role: string,
  table: string,
  privileges: string[],
) => {
  const existing = await db.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [
    role,
  ]);
  if (!existing.rowCount) {
    await db.query(`CREATE ROLE ${role} WITH LOGIN`);
  }
  await db.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
  await db.query(`GRANT ${privileges.join(', ')} ON ${table} TO ${role}`);
};

const ensureIamMapping = async (role: string, roleArn: string) => {
  const { rows } = await db.query<{ arn: string }>(
    'SELECT arn FROM sys.iam_pg_role_mappings WHERE pg_role_name = $1',
    [role],
  );

  const mapped = rows.map((r) => r.arn);

  if (!mapped.includes(roleArn)) {
    await db.query(`AWS IAM GRANT ${role} TO '${roleArn}'`);
  }

  // A replaced execution role leaves its old ARN mapped; revoke it.
  for (const stale of mapped.filter((arn) => arn !== roleArn)) {
    if (IAM_ROLE_ARN.test(stale)) {
      await db.query(`AWS IAM REVOKE ${role} FROM '${stale}'`);
    }
  }
};

/**
 * Runs once per deployment (via a CDK Trigger) as the DSQL `admin` role.
 * Every step is idempotent so re-running against an existing cluster is safe.
 */
export const lambdaHandler = async () => {
  for (const [role, arn] of Object.entries(iamRoleFor)) {
    if (!DB_ROLE_NAME.test(role) || !IAM_ROLE_ARN.test(arn)) {
      throw new Error(`Refusing to map invalid role ${role} -> ${arn}`);
    }
  }

  try {
    await dropIncompatibleTables();

    for (const statement of TABLE_DDL) {
      await db.query(statement);
    }

    for (const { role, table, privileges } of DB_ROLE_GRANTS) {
      await ensureRole(role, table, privileges);
      await ensureIamMapping(role, iamRoleFor[role]);
    }

    logger.info('Live schema migration complete', {
      tables: DB_ROLE_GRANTS.map((g) => g.table),
      roles: Object.keys(iamRoleFor),
    });
  } finally {
    await db.close();
  }
};

export const handler = middy()
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  .use({
    before: async () => {
      tracer.putAnnotation('stack', stack);
    },
  })
  .handler(lambdaHandler);
