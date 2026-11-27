# Critical alerting

`#govuk-connect-critical-alarms` should be **quiet**. Something appears there
only when users are being significantly affected, the service is effectively
unavailable, data may be lost, corrupted or exposed, or an important SLO is
burning too quickly. Everything else is a warning.

This is the summary of the _UDP Critical Alerting Strategy & SLOs_ document,
plus how it is implemented. Code lives in:

| What                              | Where                                             |
| --------------------------------- | ------------------------------------------------- |
| SLO targets, burn rate, journeys  | `cdk/constants/slo.ts`                            |
| Severity → channel/topic routing  | `cdk/lib/constructs/alarm-routing.ts`             |
| Critical alarms C1–C7             | `cdk/lib/constructs/critical-alarms-construct.ts` |
| Warning (operational) alarms      | `cdk/lib/stacks/monitoring-stack.ts`              |
| Decrypt/integrity metric (for C5) | `libs/data-access/services/EncryptionService.ts`  |

## What counts as critical

An alarm is critical only if **at least one** of these is true:

1. A user journey's error budget is burning fast enough to be exhausted within
   days (C1–C3, C7).
2. The service is effectively unavailable (C4, C7).
3. Data may be lost, corrupted or unrecoverable (C5, C6).

An alarm is **not** critical if it can be caused by a single slow request,
a Lambda cold start, a client sending bad input, or a short blip that recovers
on its own. Those are warnings.

When proposing a new critical alarm, answer: _"Would we want someone to stop
what they are doing for this, every time it fires?"_ If not, it is a warning.

## How alerts are delivered

All alarms use the platform **notifications hub**. Each alarm's actions point at
the account's `notifications-cloudwatch-alarms` SNS topic, and the alarm name
carries the routing tag:

| Environment      | Critical                                                                     | Warning                        |
| ---------------- | ---------------------------------------------------------------------------- | ------------------------------ |
| prod             | `[c=govuk-connect-critical-alarms, s=1]`. Slack, plus Teams (SOC visibility) | `[s=2]`. Spoke default channel |
| dev / stag       | `[s=2]`. Spoke default channel; never the critical channel                   | `[s=2]`. Spoke default channel |
| developer stacks | No hub actions                                                               | No hub actions                 |

Criticals also publish to the stack's own `<env>-critical-alarms` SNS topic,
which carries the PagerDuty subscription (configured in the
`/<env>/udp-param/udp/monitoring` SSM parameter). Warnings publish to
`<env>-warning-alarms`, which does not page.

> The previous AWS Chatbot channel on `<env>-critical-alarms` was removed. Slack
> delivery is now handled by the hub only.

## The critical alarms

A **bad request** is an API Gateway **5xx**. Request counts come from metric
filters on the API Gateway access log (`/aws/apigateway/<api>`), split by
journey on `resourcePath` and `httpMethod`.

Burn-rate alarms (C1–C3, C7) are **composite** alarms: the long-window alarm
**AND** the short-window alarm must both be in `ALARM`. The long window shows
the problem is sustained; the short window shows it is still happening, so the
alert clears quickly once things recover. The child `*-window` alarms have no
actions.

The thresholds are a 14.4× burn of the 30-day error budget, which spends 2% of
the month's budget in one hour.

<a id="c1"></a>

### C1. Reads are failing badly

- **Journey:** J1, read user data (`GET /v1/{resourcePath+}`)
- **SLO:** 99.5% → **threshold 7.2%** bad requests
- **Trigger:** over 7.2% over both 1h and 5m, with at least 20 requests in the hour
- **Alert:** 🔴 READS DEGRADED: User data reads are failing at a critical rate.
- **First checks:** the `getData` Lambda errors/logs, DynamoDB system errors,
  and KMS (C5 often fires alongside this).

<a id="c2"></a>

### C2. Writes are failing badly

- **Journey:** J2, update user data (`POST`/`PATCH`/`DELETE /v1/{resourcePath+}`)
- **SLO:** 99.9% → **threshold 1.44%**. Writes are stricter because failed
  writes can mean lost data.
- **Trigger:** over 1.44% over both 1h and 5m, with at least 20 requests in the hour
- **Alert:** 🔴 WRITES DEGRADED: User data updates are failing at a critical rate.
- **First checks:** the `postData`/`patchData`/`deleteData` Lambdas, DynamoDB
  write throttling, and KMS `GenerateDataKey` errors.

<a id="c3"></a>

### C3. Identity services are failing badly

- **Journey:** J3, identity and linking (`/v1/identity/*`, `POST /v1/user`)
- **SLO:** 99.5% → **threshold 7.2%**
- **Trigger:** over 7.2% over both 1h and 5m, with at least 20 requests in the hour
- **Alert:** 🔴 IDENTITY DEGRADED: Identity requests are failing at a critical rate.
- **First checks:** the identity table, and the identity Lambdas. Reads and
  writes depend on identity lookups, so expect C1/C2 to follow.

<a id="c4"></a>

### C4. UDP is effectively unavailable. **Not yet implemented**

- **Trigger (planned):** a synthetic canary that writes, reads back and deletes
  a record fails 3 times in a row, running once per minute.
- **Alert:** 🔴 SERVICE UNAVAILABLE: UDP end-to-end checks are repeatedly failing.
- **Why it matters:** C1–C3 need at least 20 requests per hour, so in quiet
  periods only a canary can detect an outage.
- **Status:** follow-up ticket. It needs a VPC-attached Synthetics canary that
  calls the private API with SigV4, plus a synthetic consumer and identity in
  prod. The same canary will also deliver the read-after-write check of C5, and
  the "canary receives a 403" trigger of C7.

<a id="c5"></a>

### C5. Data has not been stored or cannot be read back

- **Trigger:** at least one decrypt or integrity error within 5 minutes.
  Zero tolerance.
- **Alert:** 🔴 DATA INTEGRITY: Saved user data cannot be read back correctly.
- **Signal:** `EncryptionService.decryptFields` emits the EMF metric
  `UDP/DecryptionFailure` (dimension `Stack`) whenever KMS fails to unwrap a
  data key, or an AES-GCM auth tag check fails. The log line includes
  `decryptStage` (`kms` or `cipher`) and `errorName`.
- **First checks:** search Lambda logs for `DecryptionFailure`.
  - `decryptStage: kms` with `DisabledException`/`KMSInvalidStateException`
    means the key is disabled or pending deletion (see C6).
  - `decryptStage: cipher` means stored ciphertext does not match its
    data key. Treat it as possible corruption or tampering.
- **Not yet implemented:** the read-after-write mismatch trigger (comes with C4).

<a id="c6"></a>

### C6. A dangerous infrastructure change has occurred

- **Trigger:** any of the following, made via the AWS API (CloudTrail → EventBridge):
  - KMS `DisableKey`, `ScheduleKeyDeletion`, `PutKeyPolicy` or
    `DeleteImportedKeyMaterial` on the UDP encryption or DB KMS keys
  - DynamoDB `DeleteTable` on `udp-data-<env>` or `udp-identity-<env>`
  - DynamoDB `UpdateContinuousBackups` disabling PITR on those tables
- **Alert:** 🔴 DATA AT RISK: A destructive change has been made to a critical UDP resource.
- **First checks:** the matched CloudTrail event, including who made the change,
  is kept on the `<env>-data-at-risk-events` SQS queue for 14 days. A key
  scheduled for deletion can be rescued with `CancelKeyDeletion` within the
  waiting period. Disabled PITR should be re-enabled immediately.
- **Prerequisite:** CloudTrail management events must be delivered to
  EventBridge in the account (true when a trail is logging, e.g. the org
  trail). The key ARNs come from the main stack's SSM parameters
  (`/udp/<stack>/main/kms-key-arn`, `.../db-kms-key-arn`).

<a id="c7"></a>

### C7. Authentication is failing at scale

- **Trigger:** 403s above 50% of all requests over both 15m and 5m, with at
  least 20 requests in the 15 minutes.
- **Alert:** 🔴 AUTH FAILURE: UDP is rejecting most authenticated requests.
- **First checks:** the API resource policy (VPC endpoint allow-list), consumer
  IAM roles/trust policies, usage-plan API keys and WAF rules. Look for a
  recent deploy.
- **Not yet implemented:** the "canary receives a 403" trigger (comes with C4).

## Warnings

These stay useful, but they must not wake anybody on their own. They are sent
as `s=2` warnings:

- API Gateway 5xx rate above the 0.1% NFR, the 4xx count, and p95 latency
- Lambda errors, p95 duration and throttles, per function
- DynamoDB read/write throttling and system errors
- A stuck DSAR deletion, or messages on the SAR/DSAR DLQs. These become
  critical only if the deletion deadline itself is at risk. **No alarms exist
  for these yet.** When they are added, they should be warnings.

### Cold starts

Cold starts cannot trigger a critical alarm, because the critical SLIs count
errors only and never latency. For the latency warnings, the API p95 latency
and Lambda p95 duration alarms only evaluate minutes with at least 20
requests/invocations. In a quieter minute one cold start dominates the p95, so
those minutes are ignored.

## Responding to a critical alert

1. **Acknowledge** in `#govuk-connect-critical-alarms` (and PagerDuty if paged)
   so others know it is owned.
2. **Open the runbook section** linked in the alert (this page, `#c1`–`#c7`).
3. **Check for a recent deploy.** If one landed in the last hour, rolling it back
   is usually the fastest mitigation.
4. **Post updates in the alert thread** at least every 30 minutes until the
   alarm returns to `OK`. The hub posts the `OK` transition automatically.
5. If personal data may have been lost, corrupted or exposed (C5, C6), escalate
   to the data protection lead, following the incident process.
6. **Afterwards:** if the alert was not actionable, fix or demote it. A critical
   alarm that fires without needing action erodes trust in the channel.

## Changing thresholds

SLO targets and the burn rate live in `cdk/constants/slo.ts`. Change them
there, not in the construct, so the docs, thresholds and alert text stay in
step. Update this page in the same PR.
