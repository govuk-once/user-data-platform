# Performance Tests

K6-based performance tests for the UDP API, written in TypeScript. Tests validate that the API meets non-functional requirements (NFRs) under various load patterns.

## Understanding Percentiles (P95, P99, etc.)

Performance tests measure response times across thousands of requests. Rather than looking at the average (which can hide problems), we use **percentiles** to understand the distribution:

- **P50 (median)** - 50% of requests were faster than this value. This is your "typical" response time.
- **P90** - 90% of requests were faster than this value. Only 1 in 10 requests was slower.
- **P95** - 95% of requests were faster than this value. Only 1 in 20 requests was slower. **This is our primary NFR threshold.**
- **P99** - 99% of requests were faster than this value. Only 1 in 100 requests was slower. Useful for catching outliers like cold starts or throttling.

**Why not just use the average?** Imagine 99 requests take 50ms and 1 request takes 5,000ms. The average is ~100ms, which looks fine. But P99 would be 5,000ms, revealing that some users are having a terrible experience. Percentiles surface these "tail latency" problems that averages hide.

**Example:** If P95 = 180ms and P99 = 350ms, it means most requests are fast, but roughly 4% of requests (between P95 and P99) are noticeably slower. A large gap between P95 and P99 often points to intermittent issues like Lambda cold starts or DynamoDB throttling.

## Non-Functional Requirements (NFRs)

| Metric         | Threshold |
| -------------- | --------- |
| P95 Latency    | < 200ms   |
| Target RPS     | 100       |
| Max Error Rate | < 0.1%    |

These are defined in `performance/src/config.ts` and referenced across all scenarios.

## Test Scenarios

### Smoke Test

A quick sanity check running 1 virtual user for 1 iteration. Used to verify the API is reachable and responding correctly.

```bash

nx run @test/performance:smoke

```

### Baseline

Constant load at the target RPS (100 req/s) for 15 minutes. Validates NFRs under expected production traffic with a realistic mix of operations (50% getData, 15% writes, 5% deletes).

```bash

nx run @test/performance:baseline

```

### Cold Start Impact

Measures Lambda cold-start latency by jumping from 0 to 100 RPS with no warm-up and only 10 pre-allocated VUs, forcing reactive scaling. A custom `cold_start_latency` metric captures request durations during the first 30 seconds.

**Pre-requisite:** Ensure no traffic has hit the target environment for at least 10 minutes before running so that Lambda instances have scaled to zero.

```bash

nx run @test/performance:cold-start-impact

```

**Stages:** 0-100 RPS (30s) -> sustain 100 RPS (3m) -> scale to 200 RPS (1m) -> sustain 200 RPS (3m) -> cool down to 10 RPS (2m)

### Read Heavy Spike

Simulates a sudden spike in read traffic with a mix of 80% read operations. Ramps from 10 to 150 RPS over 12 minutes.

```bash

nx run @test/performance:read-heavy-spike

```

### Write Heavy Burst

Validates that write-heavy traffic doesn't cause DynamoDB throttling or KMS bottlenecks. Tests only write operations (postData, patchData, postIdentity, postUser) with ramping load from 10 to 250 RPS. Includes additional P99 thresholds on individual write operations to detect throttling.

```bash

nx run @test/performance:write-heavy-burst

```

**Stages:** warm-up at 10 RPS (2m) -> ramp to 50 (3m) -> sustain 50 (2m) -> burst to 150 (3m) -> sustain 150 (3m) -> peak at 250 (2m) -> sustain 250 (3m) -> ramp down (3m)

### Stress Reads

Read-only stress test that ramps from 10 to 300 RPS in 1-minute increments (30 stages). Tests only read operations (getData, getIdentity, getLinkedIdentity). Will abort if error rate exceeds the threshold for 30 seconds.

```bash

nx run @test/performance:stress-reads

```

### Stress Writes

Write-only stress test ramping from 10 to 300 RPS. Same structure as stress reads but targeting write operations.

```bash

nx run @test/performance:stress-writes

```

### Stress Deletes

Delete-only stress test ramping from 10 to 300 RPS. Same structure as other stress tests but targeting delete operations.

```bash

nx run @test/performance:stress-deletes

```

## Running Tests Locally

### Prerequisites

- [k6](https://k6.io) installed (`brew install k6`)
- Node.js (for TypeScript compilation)
- AWS credentials configured with access to the target environment
- VPC access to the private API Gateway endpoint (e.g. via VPN)

### Setup

```bash

cd performance && pnpm i

```

### Run a test

```bash
nx run @test/performance:<scenario-name>
```

Replace `<scenario-name>` with one of: `smoke`, `baseline`, `cold-start-impact`, `read-heavy-spike`, `write-heavy-burst`, `stress-reads`, `stress-writes`, `stress-deletes`.

## Where Tests Run Automatically

Performance tests run on **AWS CodeBuild** within the private VPC, triggered by GitHub Actions workflows. The CodeBuild project is provisioned by the `perf-stack` CDK stack.

### On Pull Requests

- **Workflow:** `pr-deploy.yml`
- **Scenario:** `smoke`
- **Trigger:** After deploy and E2E tests pass on the PR environment
- **Environment:** `pr-{N}-dev`
- **Blocking:** No (fire-and-forget, `continue-on-error: true`)

### On Release (push to main)

- **Workflow:** `release.yml`
- **Dev stage:** Runs `smoke` test after deploy and E2E tests pass on dev
- **Staging stage:** Runs `baseline` test after deploy and E2E tests pass on staging
- **Blocking:** No (fire-and-forget), but failures trigger Slack notifications

### Manual Stress Tests

- **Workflow:** `stress-test.yml` (manual dispatch)
- **Scenarios:** Choose from `stress-reads`, `stress-writes`, or `stress-deletes`
- **Environment:** Staging only

### Manual Spike Test

- **Workflow:** `spike-test.yml` (manual dispatch)
- **Scenario:** `read-heavy-spike`
- **Environment:** Staging only

### Execution flow

1. GitHub Actions triggers the reusable `__perf-test.yml` workflow
2. The workflow looks up the CodeBuild project name from CloudFormation stack outputs
3. It starts a CodeBuild build with the specified `PERF_TARGET`
4. CodeBuild runs in the VPC, installs k6, resolves AWS credentials, and executes the test
5. After the test, metrics are published to CloudWatch
6. On failure, an EventBridge rule triggers an SNS notification (Slack)

## Reports and Results

### Console Output

Each test prints a k6 text summary to stdout showing all metrics, including HTTP request durations (min, med, avg, max, P90, P95, P99), request counts, error rates, and VU statistics.

### JSON Summary

Tests write a JSON summary file (e.g. `/tmp/k6-summary.json`) containing the full metric data. This is used by the post-build metric publishing step.

### CloudWatch Metrics

After each test run, the following metrics are published to CloudWatch under the `UDP/PerformanceTests` namespace:

| Metric          | Unit         | Description                          |
| --------------- | ------------ | ------------------------------------ |
| `P95Latency`    | Milliseconds | 95th percentile request duration     |
| `ErrorRate`     | Rate (0-1)   | Proportion of failed HTTP requests   |
| `TotalRequests` | Count        | Total number of HTTP requests made   |
| `AvgRPS`        | Count/Second | Average requests per second achieved |

Each metric is dimensioned by `Environment` (dev, stag) and `scenario` (the test name).

### Understanding the Results

**Pass/Fail:** K6 evaluates thresholds at the end of each test. If any threshold is breached, the test exits with a non-zero code and is marked as failed.

- **P95 Latency < 200ms** - If this fails, response times are too high. Check for Lambda cold starts, DynamoDB throttling, or increased payload sizes.

- **Error Rate < 0.1%** - If this fails, requests are returning errors under load. Check Lambda error logs and API Gateway 5xx metrics.

- **Abort on fail** - Stress tests will abort early if the error rate threshold is breached for 30 seconds, preventing unnecessary load on a failing system.

**Cold start analysis:** The cold-start-impact test tracks a custom `cold_start_latency` metric for the first 30 seconds. Compare this against the overall P95 to understand the cold start penalty.

**Write throttling:** The write-heavy-burst test includes P99 thresholds (< 400ms) on individual write operations. If these fail while P95 passes, it indicates occasional DynamoDB throttling or KMS latency spikes.

### Viewing Historical Results

CloudWatch metrics can be used to track performance trends over time. Look for the `UDP/PerformanceTests` namespace in the CloudWatch console, filtering by environment and scenario.
