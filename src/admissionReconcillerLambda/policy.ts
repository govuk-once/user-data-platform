// Pure (dependency-free) admission policy logic for the private API Gateway.
// Kept free of AWS SDK imports so it can be unit-tested in isolation.
// See docs/external-consumer-self-service.md (Tier 2).

const VPCE_RE = /^vpce-[0-9a-f]{8,}$/;
const ACCOUNT_RE = /^\d{12}$/;

export interface RawConsumerEntry {
  name: string;
  accountId?: string;
  vpcEndpointId?: string;
}

export interface ValidConsumer {
  name: string;
  accountId: string;
  vpcEndpointId: string;
}

export interface ValidationResult {
  valid: ValidConsumer[];
  errors: string[];
}

export interface PolicyStatementJson {
  Sid: string;
  Effect: 'Allow' | 'Deny';
  Principal: '*' | { AWS: string };
  Action: string;
  Resource: string;
  Condition: Record<string, Record<string, string | string[]>>;
}

export interface PolicyDocument {
  Version: string;
  Statement: PolicyStatementJson[];
}

export interface ComposePolicyArgs {
  ownAccountId: string;
  ownVpcEndpointId: string;
  region: string;
  restApiId: string;
  consumers: ValidConsumer[];
}

/**
 * Validate raw consumer admission entries.
 *
 * Guardrails (these are the trust boundary — they live here, in code this repo
 * owns, NOT in whoever can write the SSM parameters):
 *  - accountId must be a 12-digit AWS account id
 *  - vpcEndpointId must look like a real vpce- id
 *  - the same vpcEndpointId may not be claimed by two different accounts
 *
 * Invalid entries are dropped (fail closed for that consumer) and reported in
 * `errors`; they never reach the policy.
 */
export function validateConsumers(
  rawEntries: RawConsumerEntry[],
): ValidationResult {
  const valid: ValidConsumer[] = [];
  const errors: string[] = [];
  const vpceToAccount = new Map<string, string>();

  for (const entry of rawEntries) {
    const name = entry?.name ? String(entry.name) : '<unknown>';
    const accountId = entry?.accountId;
    const vpcEndpointId = entry?.vpcEndpointId;

    if (!ACCOUNT_RE.test(accountId ?? '')) {
      errors.push(`${name}: invalid accountId "${accountId}"`);
      continue;
    }
    if (!VPCE_RE.test(vpcEndpointId ?? '')) {
      errors.push(`${name}: invalid vpcEndpointId "${vpcEndpointId}"`);
      continue;
    }

    const claimedBy = vpceToAccount.get(vpcEndpointId as string);
    if (claimedBy && claimedBy !== accountId) {
      errors.push(
        `${name}: vpcEndpointId ${vpcEndpointId} already claimed by account ${claimedBy}`,
      );
      continue;
    }
    vpceToAccount.set(vpcEndpointId as string, accountId as string);
    valid.push({
      name,
      accountId: accountId as string,
      vpcEndpointId: vpcEndpointId as string,
    });
  }

  return { valid, errors };
}

/**
 * Compose the full API Gateway resource policy document.
 *
 * Fail-closed base (always present, independent of consumers):
 *  - Deny any request whose aws:sourceVpce is not in the allow-list
 *  - Deny any request with no aws:sourceVpce at all
 *  - Allow our own traffic from our own VPC endpoint (IAM-authed internally)
 *
 * Per consumer: an account-paired Allow — the consumer's AWS account may only
 * enter through the specific VPC endpoint registered for it. An endpoint
 * registered for one account cannot be ridden by another (no broad allow).
 */
export function composePolicy({
  ownAccountId,
  ownVpcEndpointId,
  region,
  restApiId,
  consumers,
}: ComposePolicyArgs): PolicyDocument {
  const resource = `arn:aws:execute-api:${region}:${ownAccountId}:${restApiId}/*`;
  const allowedVpces = [
    ownVpcEndpointId,
    ...consumers.map((c) => c.vpcEndpointId),
  ];

  const statements: PolicyStatementJson[] = [
    {
      Sid: 'DenyNonAllowlistedVpce',
      Effect: 'Deny',
      Principal: '*',
      Action: 'execute-api:Invoke',
      Resource: resource,
      Condition: { StringNotEquals: { 'aws:sourceVpce': allowedVpces } },
    },
    {
      Sid: 'DenyMissingVpce',
      Effect: 'Deny',
      Principal: '*',
      Action: 'execute-api:Invoke',
      Resource: resource,
      Condition: { Null: { 'aws:sourceVpce': 'true' } },
    },
    {
      Sid: 'AllowOwnVpce',
      Effect: 'Allow',
      Principal: '*',
      Action: 'execute-api:Invoke',
      Resource: resource,
      Condition: { StringEquals: { 'aws:sourceVpce': ownVpcEndpointId } },
    },
  ];

  for (const consumer of consumers) {
    statements.push({
      Sid: `AllowConsumer${sidToken(consumer.name)}`,
      Effect: 'Allow',
      Principal: { AWS: `arn:aws:iam::${consumer.accountId}:root` },
      Action: 'execute-api:Invoke',
      Resource: resource,
      Condition: { StringEquals: { 'aws:sourceVpce': consumer.vpcEndpointId } },
    });
  }

  return { Version: '2012-10-17', Statement: statements };
}

// Sids must be alphanumeric; derive a stable token from the consumer name.
function sidToken(name: string): string {
  return String(name).replace(/[^a-zA-Z0-9]/g, '');
}