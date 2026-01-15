# Contributing to User Data Platform

This document describes the process for contributing to the User Data Platform.

## Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for commit messages. This convention enables automatic versioning and changelog generation.

### Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

### Types

- **feat**: A new feature (triggers minor version bump)
- **fix**: A bug fix (triggers patch version bump)
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (whitespace, formatting, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvements
- **test**: Adding or updating tests
- **chore**: Changes to build process or auxiliary tools
- **build**: Changes that affect the build system or dependencies
- **ci**: Changes to CI configuration files and scripts
- **revert**: Reverts a previous commit

### Breaking Changes

For breaking changes, add `!` after the type/scope or use `BREAKING CHANGE:` in the footer:

```
feat!: remove deprecated API endpoint
```

or

```
feat: update authentication flow

BREAKING CHANGE: authentication now requires OAuth2
```

### Examples

```bash
# Good examples
feat: add user authentication endpoint
fix: resolve memory leak in data parser
feat(api): add pagination to user list endpoint
docs: update README with installation steps
test: add unit tests for auth service
chore: upgrade dependencies to latest versions
fix!: change return type of getUserData

# Bad examples
❌ Added new feature
❌ Fixed bug
❌ Update code
❌ WIP
```

### Scope (Optional)

The scope provides additional context about what part of the codebase is affected:

```
feat(api): add new endpoint
fix(auth): resolve token expiration issue
docs(readme): update installation instructions
```

Common scopes in this project:

- `api` - API Gateway and endpoints
- `auth` - Authentication and authorization
- `lambda` - Lambda functions
- `cdk` - Infrastructure as code
- `db` - Database/DynamoDB changes
- `ci` - CI/CD workflows

## Validation

### Local Validation

Your commits are validated locally by a git hook. If your commit message doesn't follow the convention, you'll see an error:

```bash
❌ ERROR: Commit message does not follow conventional commit format
```

### CI Validation

All commits in a pull request are validated during CI. At least one commit must follow the conventional commit format for the PR to pass.

## How Versioning Works

Based on your commit messages, the version is automatically bumped:

| Commit Type                    | Version Bump          | Example          |
| ------------------------------ | --------------------- | ---------------- |
| `feat:`                        | Minor (1.0.0 → 1.1.0) | New features     |
| `fix:`, `docs:`, `chore:`      | Patch (1.0.0 → 1.0.1) | Bug fixes, docs  |
| `feat!:` or `BREAKING CHANGE:` | Major (1.0.0 → 2.0.0) | Breaking changes |

## Development Workflow

```bash
# Clone the repository
git clone https://github.com/govuk-once/user-data-platform.git
cd user-data-platform

# Install dependencies
pnpm install

# Create a feature branch
git checkout -b feat/my-new-feature

# Make your changes and commit with conventional format
git commit -m "feat: add new feature"

# Build the project
pnpm build:all

# Run linting
pnpm lint:all

# Run tests
pnpm test:all

# Push your branch
git push origin feat/my-new-feature

# Create a pull request on GitHub
```

## Developer Environments

Each developer gets an isolated AWS infrastructure environment to prevent resource collisions.

### How It Works

A unique developer ID is **auto-generated** from your git email and username:

- Format: `<firstname>-<6-char-hash>` (e.g., `tim-b3b4n5`)
- The hash ensures uniqueness even if two developers have the same name
- All AWS resources are prefixed with this ID

### Usage

```bash
# Deploy your own isolated environment
npx nx run @test/e2e:deploy-and-test
```

This creates a complete stack with your developer ID prefix, ensuring no conflicts with other developers.

## Adding API Endpoints

API routes are centrally defined in `libs/utils/routes.ts` to enable automatic OpenAPI documentation generation.

### 1. Define the Schemas

Create request and response schemas in `libs/utils/schemas/*.ts` with OpenAPI definitions:

```typescript
export const MyParamsSchema = z.object({
  userId: z.string().openapi({
    description: 'User ID',
    example: '123',
  }),
});

export const MyBodySchema = z.object({
  data: z.string().openapi({
    description: 'Data to store',
    example: 'some data',
  }),
});

export const MyResponseSchema = z.object({
  success: z.boolean(),
  id: z.string(),
});
```

### 2. Register the Route

Add your route in `libs/utils/routes.ts`:

```typescript
export const routes = {
  newRoute: {
    name: 'newRoute',
    path: '/new/{routeId}',
    method: 'POST',
    summary: 'Summary for docs',
    description: 'Detailed description for API docs',
    tags: ['tag-for-docs-grouping'],
    params: MyParamsSchema,
    body: MyBodySchema,
    response: MyResponseSchema,
    successStatus: 201,
    dynamoDbActions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'],
    authorizationScopes: ['udp/write'],
  },
};
```

### 3. Use in Lambda Handler

Apply schemas in your Lambda using the middy `zodValidator`:

```typescript
import { zodValidator } from '@libs/utils';
import { routes } from '@libs/utils';

export const handler = middy(lambdaHandler).use(
  zodValidator({
    pathParameters: routes.newRoute.params,
    body: routes.newRoute.body,
  }),
);
// ... other middleware
```

### 4. Generate OpenAPI Documentation

OpenAPI docs are automatically generated on commit via pre-commit hook.

To generate and view locally:

```bash
# Generate docs
pnpm generate:openapi

# Serve docs locally
pnpm serve:openapi
```

## Pre-commit Hooks

This project uses pre-commit hooks to maintain code quality. Hooks run automatically on `git commit`:

- Trailing whitespace removal
- End-of-file fixing
- YAML/JSON validation
- Secret detection
- Prettier formatting
- ESLint linting
- **Commit message validation** (conventional commits)
- OpenAPI documentation generation

To run hooks manually:

```bash
# Run all hooks
pre-commit run --all-files

# Run specific hook
pre-commit run eslint --all-files

# Manage detected secrets
detect-secrets audit .secrets.baseline
detect-secrets scan --baseline .secrets.baseline
```
