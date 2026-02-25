# E2E Tests

End-to-end tests for the User Data Platform API using Cucumber/Gherkin.

## Prerequisites

- Node.js and pnpm installed
- AWS credentials configured with access to the target environment
- Environment variables configured (see Configuration section)

## Setup

Install dependencies from the repository root:

```bash
pnpm i
```

## Configuration

Environment variables are automatically configured by running the `extract-cdk-outputs.sh` script, which pulls values from your deployed CloudFormation stack and creates a `.env` file.

```bash
# For personal developer environment
./e2e/scripts/extract-cdk-outputs.sh --personal

# For shared environment (e.g., dev, staging)
./e2e/scripts/extract-cdk-outputs.sh --env dev
```

The script will automatically populate the `.env` file with:

- API endpoint URL
- DynamoDB table names
- AWS region
- Other required configuration values

## Performance Test Data Seeding

For reliable performance testing, you can pre-seed the DynamoDB tables with realistic data volumes. Each developer environment has isolated tables (table names include developer ID from infrastructure), so test data won't conflict between developers.

### Seed Data

Batch writes test data to `udp-identity` and `udp-data` tables:

```bash
npx nx run @test/e2e:seed-data
```

**Environment Variables:**

- `SEED_IDENTITY_COUNT` - Number of identity records to create (default: 10000)
- `SEED_DATA_COUNT` - Number of data records to create (default: 50000)
- `TEST_PREFIX` - Prefix for test data isolation (default: "perf")

**Example with custom values:**

```bash
SEED_IDENTITY_COUNT=5000 SEED_DATA_COUNT=25000 TEST_PREFIX=perf-test npx nx run @test/e2e:seed-data
```

### Cleanup Data

Scans tables for records matching the test prefix and removes them:

```bash
npx nx run @test/e2e:cleanup-data
```

**Environment Variables:**

- `TEST_PREFIX` - Prefix to match for cleanup (default: "perf")

**Example:**

```bash
TEST_PREFIX=perf-test npx nx run @test/e2e:cleanup-data
```

## Running Tests

```bash
# Run all E2E tests
npx nx run @test/e2e:e2e

# Run with specific tags
npx nx run @test/e2e:e2e --tags "@smoke"
```

## Test Isolation

All seeded test data uses a configurable prefix (default: `perf-`) to:

- Isolate performance test data from other data
- Enable easy cleanup of test data
- Prevent interference with other tests
- Allow multiple test runs with different prefixes

Each developer environment has its own isolated DynamoDB tables (table names include developer ID from the infrastructure deployment), ensuring no conflicts between developers.
