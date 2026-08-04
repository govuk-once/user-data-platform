// Admission reconciler for the private API Gateway resource policy.
//
// Sole writer of the RestApi resource policy. Triggered by:
//   - EventBridge "Parameter Store Change" events on the per-consumer SSM path
//   - a CDK Trigger on every deploy of this repo (re-asserts the base policy)
//
// It lists every per-consumer admission parameter, validates them (see
// policy.ts), composes the full fail-closed policy, applies it via
// UpdateRestApi, then creates a deployment so the policy takes effect.
//
// Built by nx esbuild to build/admissionReconcilerLambda/index.js. Unlike the
// other lambdas this bundles the AWS SDK clients in (external: [] in
// project.json) so the security-critical reconciler does not depend on which
// @aws-sdk clients the Lambda runtime happens to ship.
// See docs/external-consumer-self-service.md (Tier 2).

import {
  SSMClient,
  GetParametersByPathCommand,
  type Parameter,
} from '@aws-sdk/client-ssm';
import {
  APIGatewayClient,
  UpdateRestApiCommand,
  CreateDeploymentCommand,
} from '@aws-sdk/client-api-gateway';

import {
  validateConsumers,
  composePolicy,
  type RawConsumerEntry,
} from './policy';

const region = process.env.AWS_REGION;
const ssm = new SSMClient({ region });
const apigw = new APIGatewayClient({ region });

interface ReconcileResult {
  applied: boolean;
  valid: number;
  rejected: number;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var ${name}`);
  return value;
}

const ACCESS_DENIED = new Set([
  'AccessDeniedException',
  'AccessDenied',
  'UnauthorizedException',
  'UnauthorizedOperation',
]);

// The reconciler is invoked by a CDK Trigger immediately after its IAM policy is
// created. IAM is eventually consistent, so the first calls can transiently fail
// with AccessDenied while the policy propagates to the execution role. Retry
// those (only) with a fixed backoff, well within the 2-minute timeout.
async function sendWithRetry<T>(
  fn: () => Promise<T>,
  label: string,
  maxAttempts = 6,
  delayMs = 5000,
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const name = (err as { name?: string })?.name ?? '';
      if (attempt >= maxAttempts || !ACCESS_DENIED.has(name)) throw err;
      console.warn(
        `${label}: ${name} (attempt ${attempt}/${maxAttempts}) — IAM may still be propagating, retrying in ${delayMs}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

// Read every per-consumer admission parameter under the path prefix.
async function readConsumerParams(
  consumerPath: string,
): Promise<RawConsumerEntry[]> {
  // SSM authorizes GetParametersByPath against the ARN of the Path you pass. A
  // trailing slash makes that resource `parameter/<path>/`, which would need to
  // be granted explicitly; passing the path WITHOUT a trailing slash makes it
  // `parameter/<path>`, matching the IAM grant exactly. The slash-terminated
  // `prefix` is used only to strip the consumer name off each result.
  const queryPath = consumerPath.replace(/\/+$/, '');
  const prefix = `${queryPath}/`;
  const entries: RawConsumerEntry[] = [];
  let nextToken: string | undefined;

  do {
    const res = await sendWithRetry(
      () =>
        ssm.send(
          new GetParametersByPathCommand({
            Path: queryPath,
            Recursive: true,
            WithDecryption: false,
            NextToken: nextToken,
          }),
        ),
      'ssm:GetParametersByPath',
    );
    for (const param of res.Parameters ?? ([] as Parameter[])) {
      const name = (param.Name ?? '').slice(prefix.length);
      try {
        const parsed = JSON.parse(param.Value ?? '{}') as {
          accountId?: string;
          vpcEndpointId?: string;
        };
        entries.push({
          name,
          accountId: parsed.accountId,
          vpcEndpointId: parsed.vpcEndpointId,
        });
      } catch {
        entries.push({ name });
      }
    }
    nextToken = res.NextToken;
  } while (nextToken);

  return entries;
}

export async function reconcile(): Promise<ReconcileResult> {
  const restApiId = requireEnv('REST_API_ID');
  const stageName = requireEnv('STAGE_NAME');
  const ownVpcEndpointId = requireEnv('OWN_VPCE_ID');
  const ownAccountId = requireEnv('OWN_ACCOUNT_ID');
  const consumerPath = requireEnv('SSM_CONSUMER_PATH');
  const apply = process.env.APPLY !== 'false';

  const raw = await readConsumerParams(consumerPath);
  const { valid, errors } = validateConsumers(raw);

  if (errors.length) {
    // Rejected entries never reach the policy; surface them loudly.
    console.error('Rejected admission entries:', JSON.stringify(errors));
  }
  console.log(
    `Admission reconcile: ${valid.length} valid consumer(s), ${errors.length} rejected`,
  );

  const policy = composePolicy({
    ownAccountId,
    ownVpcEndpointId,
    region: region ?? '',
    restApiId,
    consumers: valid,
  });

  if (!apply) {
    console.log('APPLY=false — computed policy only:', JSON.stringify(policy));
    return { applied: false, valid: valid.length, rejected: errors.length };
  }

  await sendWithRetry(
    () =>
      apigw.send(
        new UpdateRestApiCommand({
          restApiId,
          patchOperations: [
            { op: 'replace', path: '/policy', value: JSON.stringify(policy) },
          ],
        }),
      ),
    'apigateway:UpdateRestApi',
  );

  // Resource-policy changes only take effect after a (re)deployment.
  await sendWithRetry(
    () =>
      apigw.send(
        new CreateDeploymentCommand({
          restApiId,
          stageName,
          description: 'admission-reconciler: apply VPC endpoint allow-list',
        }),
      ),
    'apigateway:CreateDeployment',
  );

  console.log(`Applied admission policy and redeployed stage ${stageName}`);
  return { applied: true, valid: valid.length, rejected: errors.length };
}

// Single entrypoint for both EventBridge and CDK Trigger invocations — both
// just need a reconcile; the event payload is ignored.
export const handler = async (): Promise<ReconcileResult> => reconcile();
