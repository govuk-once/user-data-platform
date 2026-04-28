# Performace Tests

K6-based performance tests for the UDP Api, written in Typescript.

## Prerequisites

- [k6](https://k6.io) installed (`brew install k6`)
- Node.js (for Typescript compilation)
- AWS credentials configured with access to the target environment
- VPC access to the private API Gateway endpoint

## Setup

install dependancies

```bash
cd performance && pnpm i
```

## Smoke tests

Builds the typescript, then run the smoke test

```bash
nx run @test/performance:smoke
```

## Seeding read/delete scenarios

`stress-reads` and `stress-deletes` are pure read/delete scenarios — they don't issue any writes, so they need data pre-populated in DynamoDB before the k6 run. Both targets declare `seed` in their `dependsOn`, so `nx run @test/performance:stress-reads` will invoke the seed automatically.

The seed writes records directly to DynamoDB (BatchWriteItem) — bypassing the API Gateway throttle and per-Lambda concurrency limits — using deterministic udpIds so re-runs overwrite rather than grow the dataset.

Required env vars (already exported by `e2e/scripts/extract-cdk-outputs.sh`):

- `IDENTITY_TABLE_NAME`
- `DYNAMODB_TABLE_NAME`
- `AWS_REGION`

Optional overrides:

- `TEST_PREFIX` (default `per-stress-reads`) — must match the scenario's `testPrefix`. Set to `per-stress-deletes` when seeding for that scenario.
- `SEED_VU_COUNT` (default `500`) — should match the scenario's `maxVUs`.
- `RESOURCE_PATH` (default `topics`) — the data record sk.
- `LINKED_SERVICE_NAME` (default `perf-svc`) — paired identity for the exchange flow.

```bash
nx run @test/performance:seed
```

> **stress-deletes caveat**: the seed populates `SEED_VU_COUNT` records; the delete scenario will exhaust them quickly. Increase `SEED_VU_COUNT` or re-seed mid-run to sustain a longer delete test.


### Cold start

Measures Lambda cold-start latency by jumping from 0-100 RPS with no warm-up phase, uses intentionally loe pre-allocated VUs (10) to force reactive scaling. A custom `cold-start-latency` metric captures request durations during the first 30 sec of analysis

**Pre-requisite** Ensure no traffic has hit the target environment for at least 10 mins before running, so that lambda instances have scaled to zero.

```bash
nx run @test/performance:cold-start-impact
```

### Write Heavy Burst

Validates that write-heavy traffic doesn't cause DynamoDB throttling or KMS bottlenecks. Tests write operations (postData, postIdentity, postUser) with ramping-arrival-rate from 10 RPS to 250 RPS, ensuring NFRs stay within range when write spikes above the baseline.

```bash
nx run @test/performance:write-heavy-burst
```
