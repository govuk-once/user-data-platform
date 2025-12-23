## User Data Platform

## Setup

### Prerequisites

- Node.js (v18 or later)
- pnpm
- Python 3.7+ (for pre-commit hooks)
- detect-secrets (for secret detection)

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Install pre-commit and security tools:

```bash
# macOS
brew install pre-commit detect-secrets

# Or using pip
pip install pre-commit detect-secrets
```

3. Install the git hook scripts:

```bash
# Install pre-commit hooks
pre-commit install

# Install pre-push hooks (runs affected tests)
pre-commit install --hook-type pre-push
```

### Pre-commit Hooks

The project uses pre-commit hooks to maintain code quality. Hooks run automatically on `git commit`:

**On every commit:**

- Trailing whitespace removal
- End-of-file fixing
- YAML/JSON validation
- Large file detection
- Merge conflict detection
- Private key detection
- **Secret detection** (passwords, API keys, tokens via `detect-secrets`)
- Prettier formatting
- ESLint linting
- TypeScript type checking

**On git push:**

- Run all unit tests (via `vitest run`)

To run all hooks manually:

```bash
# Run all pre-commit hooks
pre-commit run --all-files

# Run specific hook
pre-commit run eslint --all-files
pre-commit run detect-secrets --all-files
```

#### Managing Detected Secrets

If `detect-secrets` flags a false positive:

```bash
# Audit the baseline and mark false positives
detect-secrets audit .secrets.baseline

# Update the baseline with new findings
detect-secrets scan --baseline .secrets.baseline
```

## Running tests use the following commands

To test the get data lambda the command: nx run @src/getDataLambda:test
To test the post data lambda the command: nx run @src/postDataLambda:test

# Running a local build

To build the get data lambda the command: nx run @src/getDataLambda:build
To build the post data lambda the command: nx run @src/postDataLambda:build

# Running the e2e Tests

command: nx run @test/e2e:deploy-and-test will deploy the code to aws and run the feature tests against it
command: nx run @test/e2e:e2e will run the tests against currently deployed code.

# Folder Structure

```
| .github
    | deploy.yaml
| cdk
    | bin
    | constants
    | lib
        constructs
        stacks
    | scripts
    cdk.json
| libs
    | middleware-utils
        |...ts
        |...unit.test.ts
    | test-utils
        | ...ts
| src
    | getDataLambda
        handler.ts
        handler.unit.test.ts
    | postDataLambda
        handler.ts
| e2e
    | src
        | features
        | helpers
        | step-definitions

./build
    getDatalambda.js

.checkov
.semgrep
.prettier

.pre-commit

```

## Developer environments

Each developer gets an isolated AWS infrastructure environment to prevent resource collisions

### How it works

A unique developer ID is **auto-generated** from your git email and user

- Format: `<firstname>-<6-char-hash>` (eg `tim-b3b4n5`)
- The hash ensures uniqueness even if two devs have the same name
- All AWS resources are prefixed with this ID

### Usage

```sh
npx nx run @test/e2e:deploy-and-test
```
