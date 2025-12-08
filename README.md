## User Data Platform

## Setup

### Prerequisites
- Node.js (v18 or later)
- pnpm
- Python 3.7+ (for pre-commit hooks)
- Terraform (for infrastructure)
- tflint (for Terraform linting)
- checkov (for Terraform security scanning)
- detect-secrets (for secret detection)

### Installation

1. Install dependencies:
```bash
pnpm install
```

2. Install pre-commit and security tools:
```bash
# macOS
brew install pre-commit terraform tflint checkov detect-secrets

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
- Terraform formatting (`terraform fmt`)
- Terraform validation
- Terraform linting (`tflint`)
- Terraform security scanning (`checkov`)

**On git push:**
- Run affected unit tests (only tests for changed code)

To run all hooks manually:
```bash
# Run all pre-commit hooks
pre-commit run --all-files

# Run specific hook
pre-commit run eslint --all-files
pre-commit run terraform_fmt --all-files
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
| libs
    | middleware-utils
        |...ts
        |...unit.test.ts
    | test-utils
        | ...ts
| modules
    | Auth
        |main.tf
        |...tf
        |project.json
    | Data Stores
        |main.tf
        |project.json
    | Api
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