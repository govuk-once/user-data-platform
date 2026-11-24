# Macie

Drop-in Amazon Macie setup for CDK apps. Enables Macie for the account/region,
provisions the sensitive data discovery results repository (S3 + KMS + export
configuration), and provides helpers for granting Macie the access it needs to
read your encrypted data.

Designed to be adopted with minimal wiring: one call in `bin/app.ts`, plus a
one-line marker on any KMS key whose data you want Macie to be able to read.

---

## Contents

| Export                                 | Purpose                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------- |
| `Macie(app, props)`                    | Installs the Macie stack and registers the access Aspect. Call once.            |
| `MacieAccess.markKMSKeyForAccess(key)` | Marks a KMS key so Macie is granted `kms:Decrypt` on it.                        |
| `MacieAccess.slrArn(scope)`            | Returns the Macie service-linked role ARN, for use in bucket policy conditions. |
| `MacieAccessAspect`                    | Applies the grants at synth time. Registered for you by `Macie()`.              |

---

## 1. Install in `bin/app.ts`

```ts
import { Macie } from '<your-lib>/macie';

const app = new App();

const awsEnv = {
  account: process.env.CDK_DEFAULT_ACCOUNT!,
  region: process.env.CDK_DEFAULT_REGION!,
};

Macie(app, {
  env: awsEnv,
  stackPrefix,
});
```

That is the whole setup. It creates a `<stackPrefix>-macie` stack containing:

- **Enablement** — turns Macie on for the account/region and creates the
  service-linked role (SLR) if it does not already exist.
- **Results KMS key** — customer-managed key that encrypts discovery results.
- **Results bucket** — where Macie writes gzipped JSON Lines discovery results.
- **Export configuration** — points Macie at the bucket and key.

> **`env` is required.** The stack must be environment-specific (concrete
> account and region) — several resources are named or scoped from them.

---

## 2. Let Macie read your encrypted data

If your data is encrypted with a customer-managed KMS key, Macie **cannot read
it** unless the key policy allows the SLR to decrypt. Mark the key where it is
created:

```ts
import { MacieAccess } from '<your-lib>/macie';

const key = new kms.Key(this, 'Key', {
  /* ... */
});

MacieAccess.markKMSKeyForAccess(key);
```

The Aspect picks up the marker at synth time and adds an `AllowMacieDecrypt`
statement (`kms:Decrypt`, `kms:DescribeKey`) to the key policy.

Without this, Macie will inventory the bucket but report every object as
unscannable.

> Only works on keys the **stack owns**. `addToResourcePolicy` is a silent
> no-op on keys imported via `fromKeyArn` / `fromLookup`.

---

## 3. Buckets with a restrictive policy

If a bucket denies access from outside a VPC (or similar), that explicit `Deny`
will also block Macie — Macie reads your objects over an AWS-internal service
path, so `aws:SourceVpc` is **absent** from its request context, and a negated
condition on an absent key evaluates as true.

Because **an explicit `Deny` always beats an `Allow`**, this cannot be fixed by
adding a separate allow statement. The SLR must be carved out _inside the same
`Deny`_, using `aws:PrincipalArn`:

```ts
import { MacieAccess } from '<your-lib>/macie';

bucket.addToResourcePolicy(
  new iam.PolicyStatement({
    sid: 'DenyAccessFromOutsideVPC',
    effect: iam.Effect.DENY,
    principals: [new iam.AnyPrincipal()],
    actions: [
      /* ... */
    ],
    resources: [bucket.bucketArn, `${bucket.bucketArn}/*`],
    conditions: {
      StringNotEquals: {
        'aws:SourceVpc': vpcId,
        'aws:PrincipalArn': MacieAccess.slrArn(this), // <-- carve-out
      },
      ArnNotLike: {
        'aws:PrincipalArn': [deploymentRoleArn],
      },
    },
  }),
);
```

Condition keys within one operator block are AND-ed, so the `Deny` only fires
when _every_ term is true. Macie's request matches `aws:PrincipalArn`, making
that term false and dropping Macie out of the `Deny` entirely. Ordinary callers
from outside the VPC still match all terms and stay denied.

Buckets with no restrictive policy need nothing — Macie discovers them
automatically once enabled.

---

## How it works

**The SLR ARN is deterministic.** It is always
`arn:<partition>:iam::<account>:role/aws-service-role/macie.amazonaws.com/AWSServiceRoleForAmazonMacie`,
derived from account and partition. Consuming stacks therefore need **no
dependency on the Macie stack** — no cross-stack exports, no `addDependency`,
no props threading. `MacieAccess.slrArn(scope)` builds it from `Stack.of(scope)`.

**Grants are applied by an Aspect.** `Macie()` registers `MacieAccessAspect` on
the app. At synth it visits every construct, looks for the marker metadata, and
adds the corresponding policy statement. Marking and granting are decoupled, so
teams mark resources locally without importing anything Macie-specific beyond
the helper.

**Enablement is idempotent.** Turning Macie on where it is already on is
absorbed rather than failing, so the stack deploys cleanly whether or not Macie
was already enabled (by a previous deploy, another region, or an
organisation-level control). Teardown deliberately does **not** disable Macie —
it is shared account state.

**Two different principals.** Reading your source data uses the _service-linked
role_ with `kms:Decrypt`. Writing discovery results uses the _service principal_
(`macie.amazonaws.com`) with `kms:GenerateDataKey` / `kms:Encrypt` on the
results key. Do not conflate them or reuse one statement for both.

---

## Verifying it works

Automated discovery samples buckets continuously but is not deterministic, so
for a first check run a one-time classification job scoped to a single bucket,
then inspect the job:

- A job that completes having processed **zero objects** usually means the
  permissions chain is broken — most often a missing key-policy grant or a
  bucket `Deny` with no SLR carve-out.
- Access errors reported on the job point at the same two causes.

Results are written to the results bucket as gzipped JSON Lines. Each record
names the bucket and object key it analysed — the S3 prefix itself carries no
information about which source bucket the results relate to.

Reading a results object requires `s3:GetObject` on the results bucket **and**
`kms:Decrypt` on the results key.

---

## Caveats

- **Imported resources cannot be granted.** `addToResourcePolicy` is a silent
  no-op on buckets and keys created via `fromBucketName` / `fromKeyArn`. The
  grant must be applied by the stack that owns the resource.
- **Macie is account/region singleton state.** Enablement, the SLR, the export
  configuration, and the results bucket exist once per account and region.
  Enablement absorbs being called where Macie is already on, but two stacks
  installing Macie into the same account and region will still contend: they
  cannot both own the results bucket, and whichever deploys last overwrites the
  account's export configuration. Deploy it from one stack per account/region —
  if a repo also deploys ephemeral per-PR or per-developer stacks into a shared
  account, install Macie only from the long-lived stage.
- **Automated discovery scans everything.** Once enabled, Macie samples every
  general-purpose bucket in the region, including ephemeral test buckets. This
  is billable per GB analysed. Scope it via the Macie console's automated
  discovery settings if the account contains a lot of throwaway data.
- **Do not apply VPC-source denies to the results bucket.** Macie writes to it
  via the service principal, so a VPC restriction would block result writes.
- **Region.** Default-enabled regions use the plain `macie.amazonaws.com`
  service principal; opt-in regions require the regionalised
  `macie.<region>.amazonaws.com` form.

---

## TODO / further work

**Automatic bucket carve-outs via the Aspect.** Today, buckets with a
restrictive policy must add the `aws:PrincipalArn` carve-out by hand (section 3).
This is the last place a consumer has to know anything about Macie's internals.

The intent is to extend `MacieAccessAspect` so that it walks every
`CfnBucketPolicy` in the tree, inspects the synthesized policy document, and:

1. Identifies `Deny` statements that would block the Macie SLR — i.e. those
   conditioned on request-context keys Macie does not populate
   (`aws:SourceVpc`, `aws:sourceVpce`, `aws:SourceIp`) under a negated operator.
2. Injects `aws:PrincipalArn: MacieAccess.slrArn(...)` into the existing
   condition block, rather than appending a new `Allow` (which would have no
   effect, since an explicit `Deny` always wins).
3. Leaves buckets with no blocking `Deny` untouched.

That would reduce adoption to a single `Macie(app, { ... })` call plus optional
KMS markers, with no bucket-level changes at all.

Open questions to resolve first:

- Mutating a synthesized L1 policy document is brittle — it depends on
  statement structure and `sid` conventions. A marker-based opt-in
  (`MacieAccess.markBucketForAccess(bucket)`) is likely safer than blanket
  detection, at the cost of one line per bucket.
- The Aspect would need to run after all policy statements are added. Aspect
  invocation order is not guaranteed relative to other mutating aspects, so
  ordering needs to be pinned explicitly.
- Detection heuristics risk false positives on `Deny` statements that are
  _intended_ to apply to Macie.

**Other candidates**

- Scheduled classification jobs as part of the stack (currently API-only, so
  they require a custom resource).
- Organisation-level delegated Macie administrator, for accounts where
  enablement should be managed centrally rather than per-account.
- Findings export to a SIEM or security account.
