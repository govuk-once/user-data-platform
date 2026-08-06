# Security Scan Remediations — Checkov & Semgrep

Tracking record of Checkov (IaC) and Semgrep (SAST / workflow) findings addressed
on this branch, the remediation applied to each, and the justification where a
finding was suppressed rather than fixed.

Two kinds of response are recorded:

- **Remediated** — the underlying resource or code was changed so the control is
  genuinely in place.
- **Suppressed** — the finding does not apply to the resource in question; a
  scoped suppression with a documented reason was added. Suppressions are only
  used where the flagged resource is CDK-generated and unconfigurable, or where
  the control is genuinely not applicable (e.g. a DLQ on a synchronous handler).

Suppressions are applied two ways:

- **Inline** via a shared `Checkov` helper (`Checkov.suppressAWSxxx(construct)`),
  used where we own the construct handle.
- **Aspect** (`CheckovSuppressionAspect`) via the same helper, used for
  CDK-generated resources we cannot reference directly (matched by construct path).

The single registry of suppression comments lives in the `Checkov` helper's
`COMMENTS` map — that map is the authoritative justification list.

---

## Checkov

### CKV_AWS_115 — Lambda function-level concurrent execution limit

- **Response:** Remediated (own handlers) + Suppressed (CDK-internal only).
- **Remediation:** `reservedConcurrentExecutions` set at the shared Lambda
  construct level, so every application handler inherits a concurrency ceiling
  (dev uses a smaller value than staging/production to limit shared-account pool
  consumption).
- **Suppression (CDK-internal only):** provider Lambdas that CDK generates and we
  cannot configure — matched by path (`AWS679`, `framework-onEvent`, `Custom::`,
  `CustomResourceProvider`, `LogRetention`, `BucketNotificationsHandler`).
- **Reason for suppression:** CDK-internal provider Lambda — cannot set reserved
  concurrency.

### CKV_AWS_116 — Lambda Dead Letter Queue (DLQ)

- **Response:** Remediated (async handlers) + Suppressed (sync handlers &
  CDK-internal).
- **Remediation:** DLQ enabled on genuinely asynchronous handlers (SQS / S3 /
  event-source triggered), where a DLQ is a real reliability control.
- **Suppression (synchronous API handlers):** a DLQ only applies to asynchronous
  invocations; synchronous API Gateway handlers return errors to the caller, so a
  DLQ is inert. Suppressed per-function via the inline helper.
- **Suppression (CDK-internal):** provider Lambdas as above.
- **Reason:** "Synchronous API handler — DLQ applies only to async invocations" /
  "CDK-internal provider lambda — DLQ not applicable".

### CKV_AWS_117 — Lambda in a VPC

- **Response:** Suppressed (CDK-internal only).
- **Reason:** CDK-internal provider Lambda — cannot place in VPC. Application
  handlers that require VPC placement are configured with VPC/subnets/security
  groups directly and are not suppressed.

### CKV_AWS_158 — CloudWatch Log Group KMS encryption

- **Response:** Suppressed (scoped).
- **Suppressed on:** (a) CDK-internal provider log groups — cannot set a KMS key;
  (b) ephemeral CodeBuild build-log groups in non-production test infrastructure.
- **Reason:** "CDK-internal provider log group — cannot set KMS key" / "Ephemeral
  CodeBuild test logs — CMK not required". Application log groups are not blanket
  suppressed.

### CKV_AWS_111 — IAM policy allows write access without constraints

- **Response:** Suppressed (scoped, CodeBuild only).
- **Suppressed on:** CDK-generated CodeBuild role/project IAM policies
  (`DefaultPolicy`, `ProjectPolicyDocument`) in e2e/perf test infrastructure —
  matched by path via the aspect (these policies have no construct handle).
- **Reason:** CDK-generated CodeBuild policy — wildcards required for build
  reporting / VPC networking (ENI creation); non-production test infra.
- **Note:** The wildcard statements were reviewed to confirm they are CodeBuild's
  own operational permissions (logs, report groups, artifact bucket, VPC ENIs)
  and not broad data-plane grants before suppression was applied.

### CKV_AWS_18 — S3 bucket access logging

- **Response:** Remediated (data buckets) + Suppressed (log-destination bucket).
- **Remediation:** Application data buckets have `serverAccessLogsBucket`
  configured (logging to the access-logs bucket).
- **Suppression:** the access-log destination bucket itself — cannot log to
  itself without recursion.
- **Reason:** "Access-log destination bucket — cannot log to itself".

### CKV_AWS_21 — S3 bucket versioning

- **Response:** Remediated (data buckets) + Suppressed (log/ephemeral buckets).
- **Remediation:** Application and Macie results buckets have `versioned: true`.
- **Suppression:** the append-only access-log destination bucket, where
  versioning adds cost without benefit.
- **Reason:** "Append-only access-log destination bucket — versioning adds cost
  without benefit".

### CKV_AWS_120 — API Gateway caching

- **Response:** Suppressed (scoped to the deployment stage).
- **Reason:** Per-user identity API responses must not be cached; caching is
  intentionally disabled. Applied to the API Gateway **stage** (the resource the
  check targets), via a helper that accepts either the `RestApi` or the stage and
  resolves to the deployment stage.

---

## Semgrep

### yaml.github-actions.security.run-shell-injection

- **Response:** Remediated.
- **Change:** Untrusted `${{ ... }}` context values (e.g.
  `github.event.pull_request.title`, `inputs.*`) removed from `run:` shell
  scripts and passed via `env:` blocks instead, referenced as quoted shell
  variables. `env:` values are bound before the shell executes, so untrusted
  input cannot break out into the command.
- **Files:** PR title validation workflow; DynamoDB restore steps; deployment-role
  resolution step (and any other `run:` steps interpolating context data).

### yaml.github-actions.security.secrets-inherit

- **Response:** Remediated.
- **Change:** `secrets: inherit` replaced with explicit `secrets:` maps passing
  only the secrets each reusable workflow requires. Corresponding
  `workflow_call.secrets:` declarations added to the called workflows so the
  explicitly-passed secrets are visible.
- **Workflows:** SonarQube scan (`SONAR_TOKEN_UDP`, `SONAR_URL`); version/release
  (`GH_UDPTAGRELEASE_*` App ID and private key).

### package_managers.pnpm.pnpm-block-exotic-sub-dependencies

- **Response:** Remediated.
- **Change:** `blockExoticSubdeps: true` added to `pnpm-workspace.yaml` — blocks
  transitive dependencies from being installed from non-registry (exotic) sources.

### package_managers.pnpm.pnpm-missing-minimum-release-age

- **Response:** Remediated.
- **Change:** `minimumReleaseAge: 10080` (7 days, in minutes) added — refuses to
  install package versions published within the last 7 days, mitigating
  compromised-release supply-chain attacks.

### package_managers.pnpm.pnpm-trust-policy

- **Response:** Remediated.
- **Change:** `trustPolicy: no-downgrade` added — prevents package updates from
  weakening the above security settings.
- **Dependent change:** pnpm pinned to `10.26.0` via `packageManager` in
  `package.json` (the three settings above require pnpm ≥10.26). CI/workflow pnpm
  setup switched from unpinned `npm install -g pnpm` to Corepack / `pnpm/action-setup`
  reading the pinned version. Lockfile regenerated under 10.26 so pre-existing
  entries are verified against the trust policy.

### GitHub Actions — pin actions to commit SHA

- **Response:** Remediated.
- **Change:** Actions referenced by mutable tag (`@v6`, `@v2`, etc.) pinned to
  full 40-character commit SHAs, with the version retained as a trailing comment
  for Dependabot tracking (e.g. `pnpm/action-setup@0977fd9… # v6.0.10`).
