import { IConstruct } from 'constructs';
import { CfnResource } from 'aws-cdk-lib';
import { Policy } from 'aws-cdk-lib/aws-iam';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';

export class Checkov {
  private static readonly COMMENTS: Record<string, string> = {
    CKV_AWS_18: 'Access logging not required for this bucket',
    CKV_AWS_21: 'Versioning not required for this bucket',
    CKV_AWS_111:
      'CDK-generated CodeBuild role — wildcards required for build reporting/networking; non-prod test infra',
    CKV_AWS_115: 'Reserved concurrency not required for this function',
    CKV_AWS_116:
      'Synchronous API handler — DLQ applies only to async invocations',
    CKV_AWS_117: 'Function does not require VPC placement',
    CKV_AWS_120: 'API Gateway caching not required for this stage',
    CKV_AWS_158: 'CMK encryption not required for this log group',
  };

  /** Suppress one or more Checkov checks on a construct's L1 resource. Merges with existing skips. */
  static suppress(
    scope: IConstruct,
    ids: string | string[],
    disabled = false,
  ): void {
    if (disabled) {
      return;
    }

    if (typeof ids === 'string') {
      ids = [ids];
    }

    if (ids.length === 0) return;

    const cfn = (
      scope instanceof CfnResource ? scope : scope.node.defaultChild
    ) as CfnResource | undefined;
    if (!cfn) {
      throw new Error(
        `Checkov: ${scope.node.path} has no CfnResource to annotate`,
      );
    }

    const skips = ids.map((id) => {
      const comment = Checkov.COMMENTS[id];
      if (!comment) throw new Error(`Checkov: no registered comment for ${id}`);
      return { id, comment };
    });

    // Read existing skips and append — never overwrite, so multiple calls compose.
    const existing = (cfn.cfnOptions.metadata?.checkov?.skip ?? []) as {
      id: string;
      comment: string;
    }[];

    // De-dupe by id so calling the same suppressor twice doesn't double the entry.
    const merged = [...existing];
    for (const skip of skips) {
      if (!merged.some((e) => e.id === skip.id)) merged.push(skip);
    }

    cfn.cfnOptions.metadata = {
      ...cfn.cfnOptions.metadata,
      checkov: { skip: merged },
    };
  }

  /** CKV_AWS_18 — S3 bucket does not have access logging enabled. */
  static suppressAWS18(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    Checkov.suppress(scope, 'CKV_AWS_18');
  }

  /** CKV_AWS_21 — S3 bucket does not have versioning enabled. */
  static suppressAWS21(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    Checkov.suppress(scope, 'CKV_AWS_21');
  }

  /** CKV_AWS_111 — IAM policy allows write access without constraints. */
  static suppressAWS111(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    Checkov.suppress(scope, 'CKV_AWS_111');
  }

  /** CKV_AWS_111 — Default IAM policy allows write access without constraints. */
  static suppressAWS111DefaultPolicy(
    scope: IConstruct,
    disabled = false,
  ): void {
    if (disabled) {
      return;
    }

    const defaultPolicy = scope.node.tryFindChild('DefaultPolicy') as
      | Policy
      | undefined;

    if (defaultPolicy) {
      Checkov.suppressAWS111(defaultPolicy.node.defaultChild as CfnResource);
    }
  }

  /** CKV_AWS_115 — Lambda has no reserved concurrency limit. */
  static suppressAWS115(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    Checkov.suppress(scope, 'CKV_AWS_115');
  }

  /** CKV_AWS_116 — Lambda has no DLQ (only relevant for async invocations). */
  static suppressAWS116(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    Checkov.suppress(scope, 'CKV_AWS_116');
  }

  /** CKV_AWS_117 — Lambda not deployed in a VPC. */
  static suppressAWS117(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    Checkov.suppress(scope, 'CKV_AWS_117');
  }

  /** CKV_AWS_120 — API Gateway stage does not have caching enabled.
   *  Accepts the RestApi or the Stage; resolves to the deployment stage,
   *  which is the resource the check actually targets. */
  static suppressAWS120(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    const target = scope instanceof RestApi ? scope.deploymentStage : scope;
    Checkov.suppress(target, 'CKV_AWS_120');
  }

  /** CKV_AWS_158 — CloudWatch log group not KMS-encrypted. */
  static suppressAWS158(scope: IConstruct, disabled = false): void {
    if (disabled) {
      return;
    }

    Checkov.suppress(scope, 'CKV_AWS_158');
  }
}
