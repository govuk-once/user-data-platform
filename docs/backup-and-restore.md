# Backup and Restore Runbook

This document covers the backup infrastructure, how to perform on-demand restores, and how to run disaster recovery testing.

---

## Table of Contents

- [Backup Overview](#backup-overview)
- [Backup Plans](#backup-plans)
- [Restoring DynamoDB Tables](#restoring-dynamodb-tables)
- [Restoring S3 Buckets](#restoring-s3-buckets)
- [Running Restores via GitHub Actions](#running-restores-via-github-actions)
- [Running Restores Locally](#running-restores-locally)
- [Disaster Recovery Testing](#disaster-recovery-testing)
- [Troubleshooting](#troubleshooting)

---

## Backup Overview

The platform uses [AWS Backup](https://docs.aws.amazon.com/aws-backup/latest/devguide/) to protect the following resources:

| Resource | Type | Backup Method |
|---|---|---|
| `udp-data-{env}` | DynamoDB | AWS Backup + PITR |
| `udp-identity-{env}` | DynamoDB | AWS Backup + PITR |
| `govuk-udpsar-bucket-{env}` | S3 | AWS Backup |

### Infrastructure

All backup resources are defined in `cdk/lib/stacks/backup-stack.ts`:

- **Backup Vault**: `{env}-backup-vault` — encrypted with a dedicated KMS key, locked with a 30-day minimum retention
- **IAM Role**: `{env}-infra-backup` — assumed by the AWS Backup service
- **SNS Notifications**: `{env}-backup-notifications` — alerts on `BACKUP_JOB_FAILED`, `COPY_JOB_FAILED`, and `S3_BACKUP_OBJECT_FAILED`

### DynamoDB Point-in-Time Recovery (PITR)

Both DynamoDB tables have PITR enabled (configured in `cdk/lib/constructs/dynamodb-construct.ts`). PITR provides continuous backups with second-level granularity and a 35-day recovery window. This is independent of the AWS Backup plans below.

---

## Backup Plans

Three backup plans are available, assigned via the `backup-plan` tag or the default selection:

| Plan | Schedule | Retention | Cold Storage |
|---|---|---|---|
| **short** | Daily at 05:00 UTC | 35 days | — |
| **medium** | Daily at 05:00 UTC | 35 days | — |
| | Monthly (1st) at 05:00 UTC | 1 year | After 30 days |
| **long** | Daily at 05:00 UTC | 35 days | — |
| | Monthly (1st) at 05:00 UTC | 1 year | After 30 days |
| | Monthly (1st) at 05:00 UTC | 5 years | After 90 days |

### Default Selection

All DynamoDB tables, RDS databases, and S3 buckets are automatically backed up under the **medium** plan.

### Tag-Based Selection

To assign a resource to a specific plan, tag it with:

```
backup-plan: short | medium | long
```

---

## Restoring DynamoDB Tables

DynamoDB supports two restore methods:

### Method 1: Point-in-Time Recovery (PITR)

Best for: restoring to a precise moment within the last 35 days.

**What happens:**
1. A new table (`{table}-restored`) is created with the data as it was at the specified time
2. The original table is untouched
3. The restore takes 5-30 minutes depending on table size

**Requirements:**
- PITR must be enabled on the source table (it is by default)
- The restore time must be within the PITR window

### Method 2: AWS Backup Vault Restore

Best for: restoring from a scheduled backup recovery point (daily/monthly snapshots).

**What happens:**
1. A recovery point is selected from the backup vault
2. A new table (`{table}-restored`) is created from that snapshot
3. The original table is untouched

**Requirements:**
- A recovery point must exist in the vault (i.e. at least one backup has run)
- The recovery point ARN is needed — find it in the AWS Backup console or via CLI

### Finding Recovery Point ARNs

```bash
aws backup list-recovery-points-by-resource \
  --resource-arn "arn:aws:dynamodb:eu-west-2:ACCOUNT_ID:table/udp-data-stag" \
  --region eu-west-2
```

### After a DynamoDB Restore

The restored table is created as `{table}-restored`. It is **not** automatically swapped with the original. Options:

1. **For testing** — use the restored table directly by pointing your test configuration at `{table}-restored`
2. **For production recovery** — the original table must be deleted (requires disabling deletion protection first) and the restore re-run targeting the original table name, or data migrated from the restored table

> **Warning:** DynamoDB does not support table rename. Swapping tables requires downtime. Coordinate with the team before performing this in production.

---

## Restoring S3 Buckets

S3 restores use AWS Backup recovery points only (PITR is not available for S3).

### Restore Options

| Option | Description |
|---|---|
| **In-place** | Restores objects back into the original bucket. Existing objects with the same key are overwritten with the backed-up version. |
| **New bucket** | Creates a new bucket and restores all objects there. Use this for testing or when you need to compare against the original. |

### Finding S3 Recovery Points

Use the `list-recovery-points` mode:

```bash
npx tsx scripts/s3-restore.ts \
  --mode list-recovery-points \
  --bucket govuk-udpsar-bucket-stag \
  --region eu-west-2
```

Or via the AWS CLI:

```bash
aws backup list-recovery-points-by-resource \
  --resource-arn "arn:aws:s3:::govuk-udpsar-bucket-stag" \
  --region eu-west-2
```

---

## Running Restores via GitHub Actions

The **Backup Restore** workflow (`.github/workflows/restore.yml`) provides an on-demand restore pipeline triggered from the GitHub Actions UI.

### How to Run

1. Go to **Actions** > **Backup Restore** > **Run workflow**
2. Fill in the inputs:

| Input | Description | Example |
|---|---|---|
| **environment** | `staging` or `production` | `staging` |
| **resource_type** | `dynamodb` or `s3` | `dynamodb` |
| **mode** | `pitr`, `backup`, or `list-recovery-points` (S3 only) | `pitr` |
| **resource_name** | The base resource name (env suffix is added automatically) | `udp-data` |
| **restore_time** | ISO-8601 timestamp (PITR only) | `2026-04-07T10:00:00Z` |
| **recovery_point_arn** | Recovery point ARN (backup mode only) | `arn:aws:backup:eu-west-2:...` |
| **new_bucket_name** | Target bucket for S3 restore (optional, S3 only) | `govuk-udpsar-bucket-stag-restored` |
| **swap** | Print table swap instructions (DynamoDB only) | `true` |

3. Click **Run workflow**

### Valid Combinations

| Resource Type | Mode | Required Inputs |
|---|---|---|
| `dynamodb` | `pitr` | `restore_time` |
| `dynamodb` | `backup` | `recovery_point_arn` |
| `s3` | `backup` | `recovery_point_arn` |
| `s3` | `list-recovery-points` | (none) |

> **Production restores** require approval through GitHub environment protection rules.

### Example: Restore DynamoDB Table to a Point in Time (Staging)

1. Environment: `staging`
2. Resource type: `dynamodb`
3. Mode: `pitr`
4. Resource name: `udp-data`
5. Restore time: `2026-04-07T10:00:00Z`

This creates `udp-data-stag-restored` with the data as it was at 10:00 UTC on 7 April 2026.

### Example: Restore SAR S3 Bucket (Staging)

1. First, find available recovery points:
   - Mode: `list-recovery-points`, Resource type: `s3`, Resource name: `govuk-udpsar-bucket`
2. Then restore:
   - Mode: `backup`, Resource type: `s3`, Resource name: `govuk-udpsar-bucket`
   - Recovery point ARN: (from the previous step)
   - New bucket name: `govuk-udpsar-bucket-stag-restored` (optional)

---

## Running Restores Locally

If you have AWS credentials configured for the target environment, you can run the restore scripts directly.

### DynamoDB PITR Restore

```bash
npx tsx scripts/dynamodb-restore.ts \
  --mode pitr \
  --table udp-data-stag \
  --restore-time "2026-04-07T10:00:00Z" \
  --region eu-west-2
```

### DynamoDB Backup Restore

```bash
npx tsx scripts/dynamodb-restore.ts \
  --mode backup \
  --table udp-data-stag \
  --recovery-point-arn "arn:aws:backup:eu-west-2:123456789012:recovery-point:abcd-1234" \
  --vault stag-backup-vault \
  --region eu-west-2
```

### S3 List Recovery Points

```bash
npx tsx scripts/s3-restore.ts \
  --mode list-recovery-points \
  --bucket govuk-udpsar-bucket-stag \
  --region eu-west-2
```

### S3 Backup Restore (to new bucket)

```bash
npx tsx scripts/s3-restore.ts \
  --mode backup \
  --bucket govuk-udpsar-bucket-stag \
  --recovery-point-arn "arn:aws:backup:eu-west-2:123456789012:recovery-point:efgh-5678" \
  --vault stag-backup-vault \
  --new-bucket govuk-udpsar-bucket-stag-restored \
  --region eu-west-2
```

### Script Reference

Both scripts support `--help` for full usage:

```bash
npx tsx scripts/dynamodb-restore.ts --help
npx tsx scripts/s3-restore.ts --help
```

---

## Disaster Recovery Testing

Regular DR testing should be performed in the **staging** environment to validate that backups are restorable and data integrity is maintained.

### Recommended Test Schedule

| Test | Frequency | Environment |
|---|---|---|
| DynamoDB PITR restore | Monthly | Staging |
| DynamoDB backup vault restore | Monthly | Staging |
| S3 backup restore | Monthly | Staging |
| Full DR simulation (all resources) | Quarterly | Staging |

### Monthly DR Test Procedure

#### 1. DynamoDB PITR Test

```bash
# Note the current time, then run a PITR restore to 5 minutes ago
npx tsx scripts/dynamodb-restore.ts \
  --mode pitr \
  --table udp-data-stag \
  --restore-time "$(date -u -v-5M +%Y-%m-%dT%H:%M:%SZ)" \
  --region eu-west-2
```

Verify:
- [ ] Restore completes without errors
- [ ] Restored table item count is reasonable (check against source)
- [ ] Sample records in the restored table match expected data

#### 2. DynamoDB Backup Vault Test

```bash
# List recent recovery points
aws backup list-recovery-points-by-resource \
  --resource-arn "arn:aws:dynamodb:eu-west-2:ACCOUNT_ID:table/udp-data-stag" \
  --region eu-west-2 \
  --query "RecoveryPoints[0].RecoveryPointArn" --output text

# Restore from the latest recovery point
npx tsx scripts/dynamodb-restore.ts \
  --mode backup \
  --table udp-data-stag \
  --recovery-point-arn "<ARN from above>" \
  --vault stag-backup-vault \
  --region eu-west-2
```

Verify:
- [ ] Restore completes without errors
- [ ] Restored table item count is reasonable

#### 3. S3 Backup Test

```bash
# List recovery points
npx tsx scripts/s3-restore.ts \
  --mode list-recovery-points \
  --bucket govuk-udpsar-bucket-stag \
  --region eu-west-2

# Restore to a new bucket
npx tsx scripts/s3-restore.ts \
  --mode backup \
  --bucket govuk-udpsar-bucket-stag \
  --recovery-point-arn "<ARN from above>" \
  --vault stag-backup-vault \
  --new-bucket govuk-udpsar-bucket-stag-dr-test \
  --region eu-west-2
```

Verify:
- [ ] Restore completes without errors
- [ ] Objects exist in the restored bucket
- [ ] SAR files are readable and intact

#### 4. Cleanup

After testing, delete the restored resources:

```bash
# Delete restored DynamoDB tables
aws dynamodb delete-table --table-name udp-data-stag-restored --region eu-west-2
aws dynamodb delete-table --table-name udp-identity-stag-restored --region eu-west-2

# Delete restored S3 bucket (empty it first)
aws s3 rm s3://govuk-udpsar-bucket-stag-dr-test --recursive
aws s3 rb s3://govuk-udpsar-bucket-stag-dr-test
```

---

## Troubleshooting

### "PITR is not enabled on table"

PITR is enabled by default in the CDK construct. If it was manually disabled:
```bash
aws dynamodb update-continuous-backups \
  --table-name <table-name> \
  --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
  --region eu-west-2
```

### "Table already exists" error during restore

A previous restore left a `-restored` table. Delete it first:
```bash
aws dynamodb delete-table --table-name <table>-restored --region eu-west-2
```

### "No recovery points found"

- Ensure the resource is included in a backup plan (check the `backup-plan` tag or default selection)
- Wait for at least one backup cycle to complete (daily at 05:00 UTC)
- Verify in the AWS Backup console: **Backup vaults** > `{env}-backup-vault` > **Recovery points**

### Restore job failed

Check the restore job status for details:
```bash
aws backup describe-restore-job \
  --restore-job-id <job-id> \
  --region eu-west-2
```

Common causes:
- **Insufficient permissions** — verify the `{env}-infra-backup` role has the required managed policies
- **KMS key issues** — the backup vault KMS key must be accessible to the backup role
- **S3 bucket already exists** — when using `--new-bucket`, the target bucket must not already exist

### Restore is slow

DynamoDB restore times depend on table size:
- Small tables (< 1 GB): 5-15 minutes
- Large tables (> 10 GB): 30-60+ minutes

S3 restore times depend on the number of objects and total size. The script polls every 30 seconds with a 60-minute timeout. For very large restores, monitor progress in the AWS Backup console.