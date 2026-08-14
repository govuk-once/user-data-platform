# Maintenance Guide

This document covers patching and upgrade strategies, runtime version upgrades, and key rotation procedures for the User Data Platform.

---

## Table of Contents

- [Patching and Upgrade Strategy](#patching-and-upgrade-strategy)
- [Upgrading Lambda Runtime Versions](#upgrading-lambda-runtime-versions)
- [Upgrading Node.js Version](#upgrading-nodejs-version)
- [Upgrading Dependencies](#upgrading-dependencies)
- [Upgrading CDK Version](#upgrading-cdk-version)
- [Upgrading GitHub Actions](#upgrading-github-actions)
- [Key Rotation Without Downtime](#key-rotation-without-downtime)
- [API Key Rotation](#api-key-rotation)
- [GitHub Secrets Rotation](#github-secrets-rotation)

---

## Patching and Upgrade Strategy

### Overview

The platform runs on AWS Lambda (Node.js 20.x) with infrastructure managed via AWS CDK. All changes flow through the release pipeline: **main -> dev -> staging -> production**, with E2E and performance tests gating each promotion

### Patching Cadence

| Category                                 | Frequency                    | Approach                          |
| ---------------------------------------- | ---------------------------- | --------------------------------- |
| **Security patches** (critical/high CVE) | Within 48 hours              | Hotfix branch, expedited pipeline |
| **Dependency updates** (minor/patch)     | Fortnightly                  | Batch PR via `pnpm update`        |
| **Runtime upgrades** (Node.js major)     | Per AWS deprecation schedule | Planned migration (see below)     |
| **CDK upgrades**                         | Monthly or as needed         | Bump, diff, test                  |
| **GitHub Actions**                       | Quarterly                    | Pin to SHA, review changelogs     |

### General Upgrade Process

1. Create a feature branch from `main`
2. Make changes and commit using [Conventional Commits](https://www.conventionalcommits.org/)
3. Open a PR -- this triggers CI checks and deploys an isolated PR environment
4. Verify E2E and performance tests pass in the PR environment
5. Merge to `main` -- the release pipeline deploys to dev, then staging, with test gates at each stage
6. Production deployment follows after staging validation

### Rollback Strategy

- CDK deployments are atomic per stack -- a failed deployment automatically rolls back
- For application-level rollbacks, revert the commit on `main` and let the pipeline redeploy
- DynamoDB tables use `RETAIN` removal policy in production, so data is safe during stack rollbacks

---

## Upgrading Lambda Runtime Versions

When AWS announces a new Node.js LTS runtime or deprecates the current one, follow this process.

### Where Runtime Is Defined

The Lambda runtime is configured in a single location with a default that applies to all 16 Lambda functions:

**`cdk/lib/constructs/lambda-construct.ts` (line 54)**

```typescript

runtime = lambda.Runtime.NODEJS_24_X,

```

Individual Lambdas can override this via the `runtime` prop, but currently none do -- all use the default.

### Step-by-step: Upgrading Lambda Runtime (e.g. Node.js 20 -> 22)

#### 1. Check AWS support

Confirm the target runtime is available in `eu-west-2`:

```bash

aws lambda list-layers --compatible-runtime nodejs22.x --region eu-west-2

```

Also check [AWS Lambda runtimes documentation](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html) for the runtime identifier (e.g. `NODEJS_24_X`).

#### 2. Check CDK support

Ensure your CDK version includes the new runtime enum. Search the CDK changelog or check:

```bash

grep -r "NODEJS_24_X" node_modules/aws-cdk-lib/aws-lambda/lib/runtime.d.ts

```

If not present, upgrade CDK first (see [Upgrading CDK Version](#upgrading-cdk-version)).

#### 3. Update the Lambda construct default

Edit `cdk/lib/constructs/lambda-construct.ts`:

```typescript

// Before
runtime = lambda.Runtime.NODEJS_22_X,

// After
runtime = lambda.Runtime.NODEJS_24_X,

```

#### 4. Update `.nvmrc`

Update the local development Node.js version to match:

```
lts/jod
```

Change to the appropriate LTS codename for Node.js 22 (e.g. `lts/jod` for 22).

#### 5. Update CI/CD workflow versions

Update `NODE_VERSION` in the GitHub Actions workflows:

- **`.github/workflows/release.yml`** (line 16): `NODE_VERSION: '24'`
- **`.github/workflows/pr-deploy.yml`**: Update the `NODE_VERSION` env var
- **`.github/workflows/ci.yml`**: Update the `node-version` in setup steps

#### 6. Update CodeBuild buildspecs

Update the Node.js runtime in:

- **`cdk/buildspec.yml`** -- E2E test runner
- **`cdk/buildspec-perf.yml`** -- Performance test runner

Look for `runtime-versions` sections:

```yaml
runtime-versions:
  nodejs: 22 # was 20
```

#### 7. Test locally

```bash
nvm use           # picks up .nvmrc
pnpm install      # reinstall with new Node
pnpm build:all    # verify builds
pnpm test:all     # verify unit tests

```

#### 8. Deploy and validate

```bash

# Open a PR to trigger the isolated PR environment

# The PR pipeline will:
#   1. Deploy all stacks with the new runtime
#   2. Run E2E tests (Cucumber)
#   3. Run performance smoke tests (k6)

```

Monitor for:

- Cold start latency changes (check CloudWatch metrics)
- Any runtime API differences causing test failures
- Memory usage changes

#### 9. Merge and monitor

After PR tests pass, merge to `main`. The release pipeline deploys to dev and staging with full test suites. Watch for:

- P95 latency remaining under 200ms
- Error rate staying below 0.1%
- No increase in cold start duration

### Zero-Downtime Guarantee

Lambda runtime changes are zero-downtime by design. When CDK updates a Lambda function's runtime:

1. AWS creates a new execution environment with the new runtime
2. New invocations are routed to the new environment
3. Existing in-flight invocations complete on the old environment
4. Old environments are decommissioned after draining

No traffic is dropped during this transition.

---

## Upgrading Node.js Version

This section covers the local development and CI Node.js version (separate from the Lambda runtime, though they should generally align).

### Files to Update

| File                              | What to change                    |
| --------------------------------- | --------------------------------- |
| `.nvmrc`                          | LTS codename (e.g. `lts/jod`)     |
| `.github/workflows/release.yml`   | `NODE_VERSION` env var            |
| `.github/workflows/pr-deploy.yml` | `NODE_VERSION` env var            |
| `.github/workflows/ci.yml`        | `node-version` in `setup-node`    |
| `cdk/buildspec.yml`               | `runtime-versions.nodejs`         |
| `cdk/buildspec-perf.yml`          | `runtime-versions.nodejs`         |
| `package.json`                    | `engines.node` field (if present) |

---

## Upgrading Dependencies

### Routine Dependency Updates

```bash
# Check for outdated packages
pnpm outdated

# Update all dependencies (minor and patch)
pnpm update --recursive

# Update a specific package
pnpm update @aws-sdk/client-dynamodb --recursive

# For major version bumps, update explicitly
pnpm add @middy/core@7 --filter ./libs/*

```

### AWS SDK Updates

The project uses AWS SDK v3 modular packages. Update them together:

```bash
pnpm update @aws-sdk/client-dynamodb @aws-sdk/client-kms @aws-sdk/client-s3 \
  @aws-sdk/client-secrets-manager @aws-sdk/client-sqs @aws-sdk/client-ec2 \
  @aws-sdk/lib-dynamodb --recursive

```

### After Any Dependency Update

1. Run `pnpm install` to update the lockfile
2. Run `pnpm build:all` to verify compilation
3. Run `pnpm test:all` to verify no regressions
4. Commit with: `chore: update dependencies`

---

## Upgrading CDK Version

### Process

```bash
# Check current version
grep "aws-cdk-lib" cdk/package.json

# Update CDK
cd cdk
pnpm add aws-cdk-lib@latest constructs@latest
pnpm add -D aws-cdk@latest cdk-nag@latest



# Preview infrastructure changes
npx nx run cdk:diff

# Run CDK tests
pnpm test:all

```

### Important

- Always run `cdk diff` before deploying to verify no unintended infrastructure changes
- CDK updates can change synthesised CloudFormation, which may trigger resource replacements
- Pay special attention to changes involving DynamoDB tables, KMS keys, or VPC resources -- these can cause data loss if replaced
- Review the [CDK release notes](https://github.com/aws/aws-cdk/releases) for breaking changes

---

## Upgrading GitHub Actions

Actions are pinned to commit SHAs for security. When upgrading:

```yaml

# Current
uses: aws-actions/configure-aws-credentials@56d6a583f00f6bad6d19d91d53a7bc3b8143d0e9 # v5.1.1

# To upgrade: find the new SHA from the release tag
# Update both the SHA and the version comment
uses: aws-actions/configure-aws-credentials@<new-sha> # v5.2.0

```

Key actions to keep updated:

- `actions/checkout`
- `actions/setup-node`
- `aws-actions/configure-aws-credentials`

---

## Key Rotation Without Downtime

### KMS Key Rotation

KMS keys are already configured with automatic rotation in `cdk/lib/constructs/kms-construct.ts`:

```typescript

enableKeyRotation: true,
rotationPeriod: Duration.days(90),

```

**This is fully automatic and zero-downtime.** AWS handles it as follows:

1. Every 90 days, AWS generates new cryptographic material for the key
2. The key ID and ARN remain the same
3. New encrypt operations use the latest key material
4. Decrypt operations automatically use whichever key material version was used to encrypt
5. No application changes or redeployments needed

**There are two KMS keys per environment:**

- `encryption-{env}` -- used for Lambda environment variables, CloudWatch Logs, SNS
- `db-kms-encryption-{env}` -- used for DynamoDB encryption at rest

#### Manual KMS Key Rotation (if required)

If you need to rotate immediately (e.g. suspected compromise):

```bash
# Trigger immediate rotation for a key
aws kms rotate-key-on-demand --key-id <key-id> --region eu-west-2

# Verify rotation
aws kms get-key-rotation-status --key-id <key-id> --region eu-west-2

```

This is also zero-downtime -- the old key material remains available for decryption.

#### Full KMS Key Replacement (compromised key)

If the key itself is compromised and old material must be invalidated:

1. Create a new KMS key via CDK (change the construct ID to force a new resource)
2. Re-encrypt all DynamoDB data with the new key
3. Update all Lambda environment variables to reference the new key
4. Deploy via the pipeline
5. Schedule the old key for deletion (30-day pending window is configured)

## **Warning:** This requires re-encrypting existing data and is NOT zero-downtime for the re-encryption step. Plan a maintenance window.

## API Key Rotation

Consumer API keys are managed via API Gateway Usage Plans and stored in AWS Secrets Manager.

### Zero-Downtime API Key Rotation

#### 1. Create the new API key

```bash
# Create a new API key in API Gateway
aws apigateway create-api-key \
  --name "consumer-name-rotated-$(date +%Y%m%d)" \
  --enabled \
  --region eu-west-2

# Associate it with the existing usage plan
aws apigateway create-usage-plan-key \
  --usage-plan-id <plan-id> \
  --key-id <new-key-id> \
  --key-type API_KEY \
  --region eu-west-2

```

#### 2. Update the secret in Secrets Manager

```bash
# Update the secret value (consumer retrieves from here)

aws secretsmanager update-secret \
  --secret-id <secret-name> \
  --secret-string '{"apiKey": "<new-key-value>"}' \
  --region eu-west-2

```

#### 3. Coordinate with the consumer

- Notify the consumer team to start using the new key
- Both old and new keys are valid during the transition window
- Agree on a cutover date

#### 4. Disable the old key

```bash

# After confirming the consumer has switched
aws apigateway update-api-key \
  --api-key <old-key-id> \
  --patch-operations op=replace,path=/enabled,value=false \
  --region eu-west-2

```

#### 5. Delete the old key (after grace period)

```bash
aws apigateway delete-api-key \
  --api-key <old-key-id> \
  --region eu-west-2
```

### Why This Is Zero-Downtime

API Gateway supports multiple active API keys per usage plan simultaneously. During rotation:

- The old key continues to work until explicitly disabled
- The new key is active immediately after creation
- There is no moment where neither key works

---

## GitHub Secrets Rotation

### OIDC Deployment Roles

The pipeline uses OIDC (OpenID Connect) for AWS authentication -- no long-lived credentials are stored. The IAM roles (`DEV_DEPLOYMENT_ROLE`, `STAGING_DEPLOYMENT_ROLE`, `PRODUCTION_DEPLOYMENT_ROLE`) generate temporary STS tokens per workflow run.

**To rotate:** Update the IAM role ARN in GitHub repository secrets if the role is recreated. No downtime impact -- only affects the next pipeline run.

### GitHub App Credentials

The release versioning uses a GitHub App (`GH_UDPTAGRELEASE_GOVUK_ONCE_APP_ID` and `GH_UDPTAGRELEASE_GOVUK_ONCE_PRIVATE_KEY`).

#### Rotating the GitHub App Private Key

1. Go to the GitHub App settings page
2. Generate a new private key (the old key remains valid)
3. Update the `GH_UDPTAGRELEASE_GOVUK_ONCE_PRIVATE_KEY` secret in the repository settings
4. Verify by triggering the release pipeline (`workflow_dispatch`)
5. Revoke the old private key from the GitHub App settings

**Zero-downtime:** Both keys are valid simultaneously until you revoke the old one.

### SonarQube Token

1. Generate a new token in SonarQube
2. Update `SONAR_TOKEN_UDP` in GitHub repository secrets
3. Old token can be revoked immediately -- it only affects CI analysis, not production

---

## Maintenance Checklist

Use this checklist for regular maintenance reviews:

- [ ] **Node.js runtime**: Is the Lambda runtime still within AWS support? Check [AWS runtime deprecation policy](https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html)
- [ ] **Dependencies**: Run `pnpm outdated` -- are there security patches pending?
- [ ] **CDK version**: Is the CDK version current? Major versions behind may miss security fixes
- [ ] **GitHub Actions**: Are pinned action SHAs up to date?
- [ ] **KMS rotation**: Verify automatic rotation is active: `aws kms get-key-rotation-status --key-id <key-id>`
- [ ] **API keys**: Review active API keys -- disable any that are no longer in use
- [ ] **IAM roles**: Review deployment role permissions -- are they least-privilege?
- [ ] **CloudWatch alarms**: Are monitoring thresholds still appropriate?
- [ ] **Performance baselines**: Have P95 latency or error rates drifted from NFR targets (P95 < 200ms, errors < 0.1%)?
- [ ] **Pre-commit hooks**: Run `pre-commit autoupdate` to update hook versions
