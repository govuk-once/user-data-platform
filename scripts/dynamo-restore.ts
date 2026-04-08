import { parseArgs } from 'node:util';
import {
  DynamoDBClient,
  DescribeTableCommand,
  DescribeContinuousBackupsCommand,
  RestoreTableToPointInTimeCommand,
} from '@aws-sdk/client-dynamodb';
import {
  BackupClient,
  StartRestoreJobCommand,
  DescribeRestoreJobCommand,
} from '@aws-sdk/client-backup';
import { IAMClient, GetRoleCommand } from '@aws-sdk/client-iam';

// ── CLI Parsing ─────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    mode: { type: 'string' },
    table: { type: 'string' },
    'restore-time': { type: 'string' },
    'recovery-point-arn': { type: 'string' },
    vault: { type: 'string', default: 'stag-backup-vault' },
    region: { type: 'string', default: process.env.AWS_REGION || 'eu-west-2' },
    swap: { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  strict: true,
});

const POLL_INTERVAL_MS = 30_000;
const MAX_WAIT_MS = 3_600_000; // 60 minutes

// ── Validation ──────────────────────────────────────────────────────────────

type Mode = 'pitr' | 'backup';

interface Config {
  mode: Mode;
  sourceTable: string;
  restoredTable: string;
  restoreTime?: string;
  recoveryPointArn?: string;
  vault: string;
  region: string;
  swap: boolean;
}

function parseConfig(): Config {
  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const mode = values.mode as string | undefined;
  const table = values.table as string | undefined;

  if (!mode || !table) {
    printUsage();
    process.exit(1);
  }

  if (mode !== 'pitr' && mode !== 'backup') {
    console.error(`Error: mode must be "pitr" or "backup", got "${mode}"`);
    process.exit(1);
  }

  if (mode === 'pitr' && !values['restore-time']) {
    console.error('Error: --restore-time is required for PITR mode');
    process.exit(1);
  }

  if (mode === 'backup' && !values['recovery-point-arn']) {
    console.error('Error: --recovery-point-arn is required for backup mode');
    process.exit(1);
  }

  return {
    mode,
    sourceTable: table,
    restoredTable: `${table}-restored`,
    restoreTime: values['restore-time'],
    recoveryPointArn: values['recovery-point-arn'],
    vault: values.vault!,
    region: values.region!,
    swap: values.swap!,
  };
}

function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/dynamodb-restore.ts [OPTIONS]

Required:
  --mode <pitr|backup>         Restore mode
  --table <table-name>         Source DynamoDB table name

PITR mode:
  --restore-time <ISO-8601>    Point-in-time to restore to (e.g. "2026-04-07T10:00:00Z")

Backup mode:
  --recovery-point-arn <arn>   ARN of the AWS Backup recovery point
  --vault <vault-name>         Backup vault name (default: stag-backup-vault)

Options:
  --region <region>            AWS region (default: eu-west-2)
  --swap                       Print swap instructions after restore
`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTableStatus(
  dynamo: DynamoDBClient,
  tableName: string,
): Promise<{ status: string; itemCount: number }> {
  try {
    const result = await dynamo.send(
      new DescribeTableCommand({ TableName: tableName }),
    );
    return {
      status: result.Table?.TableStatus ?? 'UNKNOWN',
      itemCount: result.Table?.ItemCount ?? 0,
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === 'ResourceNotFoundException') {
      return { status: 'NOT_FOUND', itemCount: 0 };
    }
    throw err;
  }
}

async function waitForTable(
  dynamo: DynamoDBClient,
  tableName: string,
): Promise<void> {
  console.log(`Waiting for table '${tableName}' to become ACTIVE...`);
  let elapsed = 0;

  while (elapsed < MAX_WAIT_MS) {
    const { status } = await getTableStatus(dynamo, tableName);

    if (status === 'ACTIVE') {
      console.log(`Table '${tableName}' is ACTIVE`);
      return;
    }

    console.log(`  Status: ${status} (${Math.round(elapsed / 1000)}s elapsed)`);
    await sleep(POLL_INTERVAL_MS);
    elapsed += POLL_INTERVAL_MS;
  }

  throw new Error(
    `Timed out waiting for table '${tableName}' to become ACTIVE`,
  );
}

async function waitForRestoreJob(
  backupClient: BackupClient,
  jobId: string,
): Promise<void> {
  console.log(`Waiting for restore job '${jobId}' to complete...`);
  let elapsed = 0;

  while (elapsed < MAX_WAIT_MS) {
    const result = await backupClient.send(
      new DescribeRestoreJobCommand({ RestoreJobId: jobId }),
    );
    const status = result.Status ?? 'UNKNOWN';

    if (status === 'COMPLETED') {
      console.log('Restore job completed successfully');
      return;
    }

    if (['FAILED', 'ABORTED'].includes(status)) {
      throw new Error(
        `Restore job ${status}: ${result.StatusMessage ?? 'no details'}`,
      );
    }

    console.log(`  Status: ${status} (${Math.round(elapsed / 1000)}s elapsed)`);
    await sleep(POLL_INTERVAL_MS);
    elapsed += POLL_INTERVAL_MS;
  }

  throw new Error('Timed out waiting for restore job');
}

// ── PITR Restore ────────────────────────────────────────────────────────────

async function restorePitr(
  dynamo: DynamoDBClient,
  config: Config,
): Promise<void> {
  console.log('Starting PITR restore...');

  const backupsResult = await dynamo.send(
    new DescribeContinuousBackupsCommand({
      TableName: config.sourceTable,
    }),
  );

  const pitrDesc =
    backupsResult.ContinuousBackupsDescription?.PointInTimeRecoveryDescription;

  if (pitrDesc?.PointInTimeRecoveryStatus !== 'ENABLED') {
    throw new Error(`PITR is not enabled on table '${config.sourceTable}'`);
  }

  console.log(
    `PITR window: ${pitrDesc.EarliestRestorableDateTime?.toISOString()} to ${pitrDesc.LatestRestorableDateTime?.toISOString()}`,
  );

  await dynamo.send(
    new RestoreTableToPointInTimeCommand({
      SourceTableName: config.sourceTable,
      TargetTableName: config.restoredTable,
      RestoreDateTime: new Date(config.restoreTime!),
    }),
  );

  console.log('PITR restore initiated');
  await waitForTable(dynamo, config.restoredTable);
}

// ── AWS Backup Restore ──────────────────────────────────────────────────────

async function restoreFromBackup(
  dynamo: DynamoDBClient,
  backupClient: BackupClient,
  iamClient: IAMClient,
  config: Config,
): Promise<void> {
  console.log('Starting AWS Backup restore...');

  // Derive role name from vault: "stag-backup-vault" → "stag-infra-backup"
  const envPrefix = config.vault.replace(/-backup-vault$/, '');
  const roleName = `${envPrefix}-infra-backup`;

  const roleResult = await iamClient.send(
    new GetRoleCommand({ RoleName: roleName }),
  );
  const roleArn = roleResult.Role?.Arn;

  if (!roleArn) {
    throw new Error(`Could not find ${roleName} IAM role`);
  }

  console.log(`Using backup role: ${roleArn}`);

  const restoreResult = await backupClient.send(
    new StartRestoreJobCommand({
      RecoveryPointArn: config.recoveryPointArn!,
      IamRoleArn: roleArn,
      Metadata: {
        targetTableName: config.restoredTable,
        encryptionType: 'Default',
      },
    }),
  );

  const jobId = restoreResult.RestoreJobId;

  if (!jobId) {
    throw new Error('No RestoreJobId returned from StartRestoreJob');
  }

  console.log(`Restore job started: ${jobId}`);
  await waitForRestoreJob(backupClient, jobId);
  await waitForTable(dynamo, config.restoredTable);
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseConfig();

  const clientConfig = { region: config.region };
  const dynamo = new DynamoDBClient(clientConfig);
  const backupClient = new BackupClient(clientConfig);
  const iamClient = new IAMClient(clientConfig);

  console.log('============================================');
  console.log('DynamoDB Restore');
  console.log('============================================');
  console.log(`Mode:            ${config.mode}`);
  console.log(`Source table:    ${config.sourceTable}`);
  console.log(`Restored table:  ${config.restoredTable}`);
  console.log(`Region:          ${config.region}`);
  if (config.mode === 'pitr') {
    console.log(`Restore time:    ${config.restoreTime}`);
  } else {
    console.log(`Recovery point:  ${config.recoveryPointArn}`);
    console.log(`Vault:           ${config.vault}`);
  }
  console.log(`Swap tables:     ${config.swap}`);
  console.log('============================================');
  console.log('');

  // Check for existing restored table
  const { status: existingStatus } = await getTableStatus(
    dynamo,
    config.restoredTable,
  );

  if (existingStatus !== 'NOT_FOUND') {
    throw new Error(
      `Table '${config.restoredTable}' already exists (status: ${existingStatus}). Delete it first or choose a different target name.`,
    );
  }

  // Execute restore
  if (config.mode === 'pitr') {
    await restorePitr(dynamo, config);
  } else {
    await restoreFromBackup(dynamo, backupClient, iamClient, config);
  }

  // Verification
  console.log('');
  console.log('============================================');
  console.log('Restore verification');
  console.log('============================================');

  const source = await getTableStatus(dynamo, config.sourceTable);
  const restored = await getTableStatus(dynamo, config.restoredTable);

  console.log(`Source table item count:   ${source.itemCount}`);
  console.log(`Restored table item count: ${restored.itemCount}`);
  console.log('');

  // Swap instructions
  if (config.swap) {
    console.log('============================================');
    console.log('Table swap');
    console.log('============================================');
    console.log('');
    console.log('DynamoDB does not support atomic table rename.');
    console.log('To swap tables, the following manual steps are required:');
    console.log('');
    console.log(
      `  1. Disable deletion protection on '${config.sourceTable}' (if enabled)`,
    );
    console.log(`  2. Delete the original table: '${config.sourceTable}'`);
    console.log('  3. Restore again with the original table name');
    console.log(
      `     OR export/import data from '${config.restoredTable}' to a new '${config.sourceTable}'`,
    );
    console.log('');
    console.log(
      `For staging testing, the restored table '${config.restoredTable}' can be used`,
    );
    console.log('directly by updating the application configuration.');
    console.log('');
    console.log(
      'WARNING: Swapping tables will cause downtime. Coordinate with the team.',
    );
  }

  console.log('');
  console.log(`Restore complete. Restored table: ${config.restoredTable}`);
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
