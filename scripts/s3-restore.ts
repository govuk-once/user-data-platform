import { parseArgs } from 'node:util';
import {
  S3Client,
  HeadBucketCommand,
  ListObjectVersionsCommand,
} from '@aws-sdk/client-s3';
import {
  BackupClient,
  StartRestoreJobCommand,
  DescribeRestoreJobCommand,
  ListRecoveryPointsByResourceCommand,
} from '@aws-sdk/client-backup';
import { IAMClient, GetRoleCommand } from '@aws-sdk/client-iam';

// ── CLI Parsing ─────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    mode: { type: 'string' },
    bucket: { type: 'string' },
    'recovery-point-arn': { type: 'string' },
    'restore-time': { type: 'string' },
    vault: { type: 'string', default: 'stag-backup-vault' },
    region: { type: 'string', default: process.env.AWS_REGION || 'eu-west-2' },
    'new-bucket': { type: 'string' },
    help: { type: 'boolean', default: false },
  },
  strict: true,
});

const POLL_INTERVAL_MS = 30_000;
const MAX_WAIT_MS = 3_600_000; // 60 minutes

// ── Types ───────────────────────────────────────────────────────────────────

type Mode = 'backup' | 'list-recovery-points';

interface Config {
  mode: Mode;
  bucket: string;
  recoveryPointArn?: string;
  restoreTime?: string;
  vault: string;
  region: string;
  newBucket?: string;
}

// ── Validation ──────────────────────────────────────────────────────────────

function parseConfig(): Config {
  if (values.help) {
    printUsage();
    process.exit(0);
  }

  const mode = values.mode as string | undefined;
  const bucket = values.bucket as string | undefined;

  if (!mode || !bucket) {
    printUsage();
    process.exit(1);
  }

  if (mode !== 'backup' && mode !== 'list-recovery-points') {
    console.error(
      `Error: mode must be "backup" or "list-recovery-points", got "${mode}"`,
    );
    process.exit(1);
  }

  if (mode === 'backup' && !values['recovery-point-arn']) {
    console.error('Error: --recovery-point-arn is required for backup mode');
    process.exit(1);
  }

  return {
    mode,
    bucket,
    recoveryPointArn: values['recovery-point-arn'],
    restoreTime: values['restore-time'],
    vault: values.vault!,
    region: values.region!,
    newBucket: values['new-bucket'],
  };
}

function printUsage(): void {
  console.log(`
Usage: npx tsx scripts/s3-restore.ts [OPTIONS]

Required:
  --mode <backup|list-recovery-points>   Restore mode
  --bucket <bucket-name>                 Source S3 bucket name

Backup restore mode:
  --recovery-point-arn <arn>   ARN of the AWS Backup recovery point
  --new-bucket <name>          Restore to a new bucket (default: restores to source bucket)

List recovery points mode:
  (no additional options)      Lists available recovery points for the bucket

Options:
  --vault <vault-name>         Backup vault name (default: stag-backup-vault)
  --region <region>            AWS region (default: eu-west-2)
`);
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function getBackupRoleArn(
  iamClient: IAMClient,
  vault: string,
): Promise<string> {
  const envPrefix = vault.replace(/-backup-vault$/, '');
  const roleName = `${envPrefix}-infra-backup`;

  const roleResult = await iamClient.send(
    new GetRoleCommand({ RoleName: roleName }),
  );
  const roleArn = roleResult.Role?.Arn;

  if (!roleArn) {
    throw new Error(`Could not find ${roleName} IAM role`);
  }

  return roleArn;
}

// ── List Recovery Points ────────────────────────────────────────────────────

async function listRecoveryPoints(
  backupClient: BackupClient,
  config: Config,
): Promise<void> {
  const resourceArn = `arn:aws:s3:::${config.bucket}`;

  console.log(`Listing recovery points for ${resourceArn}...`);
  console.log('');

  const result = await backupClient.send(
    new ListRecoveryPointsByResourceCommand({
      ResourceArn: resourceArn,
    }),
  );

  const points = result.RecoveryPoints ?? [];

  if (points.length === 0) {
    console.log('No recovery points found for this bucket.');
    console.log(
      'Ensure the bucket is included in a backup plan and at least one backup has completed.',
    );
    return;
  }

  console.log(`Found ${points.length} recovery point(s):`);
  console.log('');
  console.log(
    'Recovery Point ARN                                                        | Status    | Created',
  );
  console.log(
    '--------------------------------------------------------------------------+-----------+------------------------',
  );

  for (const point of points) {
    const arn = point.RecoveryPointArn ?? 'N/A';
    const status = (point.Status ?? 'N/A').padEnd(9);
    const created = point.CreationDate?.toISOString() ?? 'N/A';
    console.log(`${arn} | ${status} | ${created}`);
  }

  console.log('');
  console.log(
    'Use --recovery-point-arn with --mode backup to restore from a specific point.',
  );
}

// ── S3 Backup Restore ───────────────────────────────────────────────────────

async function restoreFromBackup(
  s3Client: S3Client,
  backupClient: BackupClient,
  iamClient: IAMClient,
  config: Config,
): Promise<void> {
  const targetBucket = config.newBucket ?? config.bucket;

  console.log('Starting S3 backup restore...');
  console.log(`Target bucket: ${targetBucket}`);

  // If restoring to a new bucket, verify it doesn't already exist
  if (config.newBucket) {
    try {
      await s3Client.send(new HeadBucketCommand({ Bucket: config.newBucket }));
      throw new Error(
        `Bucket '${config.newBucket}' already exists. Choose a different name or delete it first.`,
      );
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotFound') {
        // Expected — bucket doesn't exist yet, restore will create it
      } else if (
        err instanceof Error &&
        err.message.includes('already exists')
      ) {
        throw err;
      }
      // Other errors (e.g. 403) are fine — bucket may exist in another account
    }
  }

  const roleArn = await getBackupRoleArn(iamClient, config.vault);
  console.log(`Using backup role: ${roleArn}`);

  // Build restore metadata
  // When restoring to the same bucket, AWS Backup restores objects in-place
  // When restoring to a new bucket, it creates the bucket and restores objects there
  const metadata: Record<string, string> = {
    Encrypted: 'true',
  };

  if (config.newBucket) {
    metadata['DestinationBucketName'] = config.newBucket;
    metadata['NewBucket'] = 'true';
  } else {
    metadata['DestinationBucketName'] = config.bucket;
    metadata['NewBucket'] = 'false';
  }

  const restoreResult = await backupClient.send(
    new StartRestoreJobCommand({
      RecoveryPointArn: config.recoveryPointArn!,
      IamRoleArn: roleArn,
      Metadata: metadata,
    }),
  );

  const jobId = restoreResult.RestoreJobId;

  if (!jobId) {
    throw new Error('No RestoreJobId returned from StartRestoreJob');
  }

  console.log(`Restore job started: ${jobId}`);
  await waitForRestoreJob(backupClient, jobId);

  // Verification
  console.log('');
  console.log('============================================');
  console.log('Restore verification');
  console.log('============================================');

  try {
    const versions = await s3Client.send(
      new ListObjectVersionsCommand({
        Bucket: targetBucket,
        MaxKeys: 1,
      }),
    );
    const hasObjects =
      (versions.Versions?.length ?? 0) > 0 ||
      (versions.DeleteMarkers?.length ?? 0) > 0;
    console.log(
      `Bucket '${targetBucket}' exists: true, has objects: ${hasObjects}`,
    );
  } catch {
    console.log(
      `Warning: Could not verify bucket '${targetBucket}' — check AWS console`,
    );
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const config = parseConfig();

  const clientConfig = { region: config.region };
  const s3Client = new S3Client(clientConfig);
  const backupClient = new BackupClient(clientConfig);
  const iamClient = new IAMClient(clientConfig);

  console.log('============================================');
  console.log('S3 Restore');
  console.log('============================================');
  console.log(`Mode:            ${config.mode}`);
  console.log(`Bucket:          ${config.bucket}`);
  console.log(`Region:          ${config.region}`);
  if (config.mode === 'backup') {
    console.log(`Recovery point:  ${config.recoveryPointArn}`);
    console.log(`Vault:           ${config.vault}`);
    console.log(`Target bucket:   ${config.newBucket ?? config.bucket}`);
  }
  console.log('============================================');
  console.log('');

  if (config.mode === 'list-recovery-points') {
    await listRecoveryPoints(backupClient, config);
  } else {
    await restoreFromBackup(s3Client, backupClient, iamClient, config);
  }

  console.log('');
  console.log('Restore complete.');
}

main().catch((err) => {
  console.error(`Error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
