## User Data Platform

## Setup

### Prerequisites

- Node.js 22 (LTS) - see `.nvmrc`
- pnpm
- Python 3.7+ (for pre-commit hooks)

### Installation

```bash
# Install dependencies
pnpm install

# Install pre-commit and security tools (macOS)
brew install pre-commit detect-secrets checkov semgrep

# Or using pip
pip install pre-commit detect-secrets checkov semgrep
```

## Running Tests and Builds

```bash
# Test specific lambdas
nx run @src/getDataLambda:test
nx run @src/postDataLambda:test

# Build specific lambdas
nx run @src/getDataLambda:build
nx run @src/postDataLambda:build

# Test all
pnpm test:all

# Build all
pnpm build:all

# Lint all
pnpm lint:all
```

## E2E Tests

```bash
# Deploy and run tests
nx run @test/e2e:deploy-and-test

# Run tests against deployed code
nx run @test/e2e:e2e
```

## Architecture

### Project Structure

- `.github/` - GitHub Actions workflows
- `cdk/` - AWS CDK infrastructure code
- `src/` - Lambda function handlers
- `libs/` - Shared utilities and services
- `e2e/` - End-to-end tests
- `docs/` - Documentation

### Key Technologies

- **Runtime**: Node.js 22, TypeScript
- **Infrastructure**: AWS CDK
- **API**: API Gateway, Lambda
- **Database**: DynamoDB
- **Testing**: Vitest, Cucumber
- **Build**: Nx monorepo

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for detailed guidelines on:

- Commit message conventions (required for auto-versioning)
- Development workflow
- Adding API endpoints
- Developer environments
- Pre-commit hooks
- Pull request process
