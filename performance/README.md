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
