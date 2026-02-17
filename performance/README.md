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
