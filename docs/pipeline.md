# Build, Test & Deploy Pipelines

A zero-to-deploy guide for new developers on the User Data Platform.

## Prerequisites

Before you can trigger or interact with pipelines, ensure you have:

1. **Repository access** - push access to `govuk-once/user-data-platform`

2. **AWS credentials** - your team lead must grant you access to the AWS dev account (eu-west-2)

3. **Local tooling installed** (see [Setup](#local-setup))

### Local setup

```bash

# Clone the repo

git clone https://github.com/govuk-once/user-data-platform.git

cd user-data-platform



# Install dependencies

pnpm install



# Install pre-commit and security tools

brew install pre-commit detect-secrets   # macOS

# pip install pre-commit detect-secrets  # alternative



# Install git hooks

pre-commit install

pre-commit install --hook-type pre-push

```

---

## Pipeline overview

There are four GitHub Actions workflows that form the CI/CD pipeline:

| Workflow | File | Trigger | Purpose |

|----------|------|---------|---------|

| **Release Candidate** | `ci.yml` | PR opened/updated | Lint, build, test, security scans |

| **PR Deploy & Tests** | `pr-deploy.yml` | PR opened/updated | Deploy isolated environment, run E2E & perf tests |

| **Release Pipeline** | `release.yml` | Push to `main` or manual dispatch | Version, deploy to dev, E2E, deploy to staging, E2E |

| **PR Cleanup** | `pr-cleanup.yml` | PR closed | Destroy the PR's isolated AWS environment |

### How they fit together

```

PR opened/updated

  ├── ci.yml ──────────────── lint → build → unit tests → SonarQube → Checkov

  └── pr-deploy.yml ───────── CDK deploy (pr-{N}-dev-*) → E2E tests → perf smoke



PR merged to main

  └── release.yml

        ├── version.yml ───── calculate version → git tag → GitHub Release

        ├── deploy dev ────── CDK deploy (dev-*) → E2E tests → perf smoke

        └── deploy staging ── CDK deploy (stag-*) → E2E tests → perf baseline



PR closed (merged or not)

  └── pr-cleanup.yml ──────── CDK destroy (pr-{N}-dev-*)

```

---

## Step by step: triggering a pipeline

### 1. Create a feature branch

```bash

git checkout -b feat/my-feature

```

### 2. Make your changes and commit

Commits **must** follow [Conventional Commits](https://www.conventionalcommits.org/) format. The pre-commit hook validates this automatically.

```bash

git commit -m "feat(api): add new endpoint for user lookup"

```

Common types: `feat`, `fix`, `docs`, `chore`, `test`, `refactor`, `ci`

### 3. Push your branch

```bash

git push origin feat/my-feature

```

The pre-push hook runs all unit tests before allowing the push.

### 4. Open a pull request

Create a PR targeting `main` on GitHub. This automatically triggers two pipelines in parallel:

**CI pipeline (`ci.yml`)** runs:

1. Pre-commit hygiene checks (whitespace, YAML, secrets)

2. Conventional commit validation (at least one valid commit required)

3. `pnpm lint:affected` and `pnpm format:check`

4. `pnpm build:affected`

5. `pnpm test:affected` (unit tests)

6. SonarQube code quality scan

7. Checkov infrastructure security scan

**PR Deploy pipeline (`pr-deploy.yml`)** runs:

1. Deploys an isolated AWS environment with stack prefix `pr-{PR_NUMBER}-dev-*`

2. Uploads source code to S3

3. Triggers AWS CodeBuild to run Cucumber E2E tests

4. Posts E2E test results as a comment on the PR

5. Runs k6 performance smoke tests

### 5. Review the results

- Check the **Checks** tab on the PR for CI status

- Look for the **E2E test results comment** posted by the bot

- If anything fails, see [Troubleshooting](#troubleshooting-common-failures) below

### 6. Merge to main

Once all checks pass and the PR is approved, merge to `main`. This triggers the **Release Pipeline**:

1. **Versioning** - automatically bumps the version based on your commit types and creates a git tag + GitHub Release

2. **Deploy to dev** - CDK deploys to the shared dev environment

3. **E2E tests on dev** - full Cucumber suite via CodeBuild

4. **Performance tests on dev** - k6 smoke tests

5. **Deploy to staging** - CDK deploys to staging (only if dev E2E passes)

6. **E2E tests on staging** - full Cucumber suite

7. **Performance tests on staging** - k6 baseline tests

Production deployment is currently disabled and will be enabled once permissions are configured.

### 7. Cleanup

When the PR is closed (merged or not), `pr-cleanup.yml` automatically destroys the isolated `pr-{N}-dev-*` AWS stacks.

---

## Triggering a release manually

You can manually trigger the release pipeline without merging:

1. Go to **Actions** > **Release Pipeline** in GitHub

2. Click **Run workflow**

3. Select the `main` branch

4. Click **Run workflow**

This is useful for redeploying the current state of `main` if a previous release failed partway through.

---

## Running pipelines locally

### Unit tests

```bash

pnpm test:all              # run all unit tests

pnpm test:affected         # run tests affected by your changes

nx run @src/getDataLambda:test   # run tests for a specific lambda

```

### Linting and formatting

```bash

pnpm lint:all              # lint everything

pnpm lint:affected         # lint affected files

pnpm format:check          # check formatting

pnpm format:write          # auto-fix formatting

```

### Build

```bash

pnpm build:all             # build everything

pnpm build:affected        # build affected projects

```

### Deploy your own dev environment

```bash

# Deploy and run E2E tests against your personal stack

npx nx run @test/e2e:deploy-and-test



# Or just run E2E tests against already-deployed code

npx nx run @test/e2e:e2e

```

Your personal environment uses a developer ID auto-generated from your git email (format: `firstname-6charhash`), so it won't collide with other developers' environments.

### CDK operations

```bash

npx nx run cdk:diff          # preview infrastructure changes

npx nx run cdk:deploy:dev    # deploy to dev

npx nx run cdk:destroy:dev   # tear down your dev environment

```

---

## Environments

| Environment | Stack prefix | Deployed by | E2E tests | Perf tests | Cleanup |

|-------------|-------------|-------------|-----------|------------|---------|

| **PR (ephemeral)** | `pr-{N}-dev-*` | PR opened/updated | Cucumber (CodeBuild) | k6 smoke | Auto on PR close |

| **Dev (shared)** | `dev-*` | Merge to main | Cucumber (CodeBuild) | k6 smoke | Manual |

| **Staging** | `stag-*` | After dev E2E passes | Cucumber (CodeBuild) | k6 baseline | Manual |

| **Production** | `prod-*` | Disabled | Not yet automated | N/A | Manual |

---

## Troubleshooting common failures

### Pre-commit hook fails

**Symptom:** `git commit` is rejected locally.

| Error | Fix |

|-------|-----|

| `Commit message does not follow conventional commit format` | Use the format `type(scope): description` — e.g. `feat: add login page` |

| `detect-secrets` flags a false positive | Run `detect-secrets audit .secrets.baseline`, mark it as a false positive, then `detect-secrets scan --baseline .secrets.baseline` |

| Prettier formatting errors | Run `pnpm format:write` to auto-fix |

| ESLint errors | Run `pnpm lint:all` to see details, fix manually |

| TypeScript errors | Run `pnpm exec tsc --noEmit` to see the full error output |

### Pre-push hook fails

**Symptom:** `git push` is rejected because unit tests fail.

Fix the failing tests locally:

```bash

pnpm test:all

```

### CI pipeline (`ci.yml`) fails

**Symptom:** The "Release Candidate" check fails on your PR.

Check which step failed in the GitHub Actions log:

| Failed step | Fix |

|-------------|-----|

| **Conventional Commits** | Ensure at least one commit in the PR follows `type(scope): description` format. You can amend or add a new properly formatted commit |

| **Lint & format** | Run `pnpm lint:affected` and `pnpm format:write` locally, commit the fixes |

| **Build** | Run `pnpm build:affected` locally to reproduce. Usually a TypeScript compilation error |

| **Unit Tests** | Run `pnpm test:affected` locally. Check for environment-specific issues |

| **SonarQube** | Review the SonarQube report linked in the PR check. Fix code quality or security issues flagged |

| **Checkov** | Run `checkov -d cdk --config-file cdk/.checkov.yaml` locally. Fix IaC security issues or add skip rules if justified |

### PR Deploy (`pr-deploy.yml`) fails

**Symptom:** The "PR Deploy & Tests" check fails.

| Failed step | Fix |

|-------------|-----|

| **CDK deploy** | Check the GitHub Actions log for CloudFormation errors. Common causes: IAM permission issues, resource limit reached, or invalid CDK construct configuration. Run `npx nx run cdk:diff` locally to preview changes |

| **E2E tests (CodeBuild)** | The build ID is posted in the PR comment. Check CodeBuild logs in the AWS Console: `eu-west-2 > CodeBuild > Build projects > pr-{N}-dev-e2e`. Look at the build logs for Cucumber test failures |

| **S3 upload** | Usually a transient AWS error. Re-run the workflow from the Actions tab |

### Release pipeline (`release.yml`) fails

**Symptom:** A merge to main doesn't deploy successfully.

| Failed step | Fix |

|-------------|-----|

| **Versioning** | Check if the GitHub App credentials (`GH_UDPTAGRELEASE_*`) are valid. Verify the last git tag exists and is reachable |

| **Deploy to dev/staging** | Same as CDK deploy troubleshooting above. Check CloudFormation events in AWS Console for the specific stack (`dev-*` or `stag-*`) |

| **E2E tests on dev/staging** | Check CodeBuild logs in the AWS Console for the relevant environment. The E2E stack name is `{env}-e2e` |

### E2E tests fail in CodeBuild

To debug E2E test failures:

1. Find the **Build ID** from the GitHub Actions log or PR comment

2. Go to **AWS Console** > **CodeBuild** > **Build history**

3. Find the build and check the **Build logs** tab

4. Common issues:
   - **API not ready** - the deployment may still be propagating. Re-run the workflow

   - **Cognito/auth errors** - check that the Cognito user pool and app client are correctly configured in the stack outputs

   - **Timeout** - E2E tests have a 60-minute timeout. If tests are slow, check for Lambda cold starts or DynamoDB throttling

   - **Environment variable missing** - the buildspec (`cdk/buildspec.yml`) constructs `.env` from CloudFormation outputs. Verify the stack outputs are complete

### CDK deployment fails locally

```bash

# Check you have valid AWS credentials

aws sts get-caller-identity



# Preview what will change

npx nx run cdk:diff



# If bootstrap is needed (first time in an account)

npx nx run cdk:bootstrap

```

Common issues:

- **"Stack is in ROLLBACK_COMPLETE state"** - delete the failed stack manually in CloudFormation console, then retry

- **"Resource limit exceeded"** - check for leaked stacks from old PRs and destroy them with `npx nx run cdk:destroy:dev`

- **"Access denied"** - verify your AWS role has the required permissions

### Performance tests fail

Performance tests (k6) run as fire-and-forget on PRs (non-blocking). On the release pipeline, they also run after E2E tests. If they fail:

1. Check the CodeBuild logs for the perf stack (`{prefix}-perf`)

2. Verify k6 thresholds in `performance/src/` aren't too strict for the environment

3. Check if the API is under load from other sources

---

## Key files reference

| File | Purpose |

|------|---------|

| `.github/workflows/ci.yml` | PR validation (lint, build, test, security) |

| `.github/workflows/pr-deploy.yml` | PR environment deployment and E2E/perf tests |

| `.github/workflows/release.yml` | Release pipeline (version, deploy dev/staging) |

| `.github/workflows/version.yml` | Automatic versioning from conventional commits |

| `.github/workflows/pr-cleanup.yml` | Destroy PR environment on close |

| `.github/workflows/__perf-test.yml` | Reusable performance test workflow |

| `cdk/buildspec.yml` | CodeBuild spec for E2E tests (Cucumber) |

| `cdk/buildspec-perf.yml` | CodeBuild spec for performance tests (k6) |

| `cdk/bin/app.ts` | CDK app entry point |

| `cdk/project.json` | Nx targets for CDK (deploy, diff, destroy) |

| `.pre-commit-config.yaml` | Local git hook configuration |
