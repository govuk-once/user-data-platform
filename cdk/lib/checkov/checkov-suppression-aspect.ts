import { CfnResource, IAspect } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

type Skip = { id: string; comment: string };

/**
 * Applies Checkov suppression metadata to synthesized resources.
 *
 * Suppressions are scoped by construct PATH, not just resource type, so that
 * CDK-generated internal resources (custom-resource provider Lambdas, their log
 * groups, log-retention helpers) are exempted while your own resources are still
 * checked. Blanket type-level skips are deliberately avoided — a broad "skip
 * versioning on every bucket" is hard to defend at review.
 */
export class CheckovSuppressionAspect implements IAspect {
  // CDK-internal constructs you do not author and cannot configure.
  private static readonly CDK_INTERNAL = [
    'AWS679', // singleton AwsCustomResource provider Lambda + its log group
    'framework-onEvent', // Provider framework Lambda
    'Custom::', // custom-resource handlers
    'CustomResourceProvider',
    'LogRetention', // CDK log-retention helper Lambda
    'BucketNotificationsHandler', // Custom::S3BucketNotifications provider — not configurable
  ];

  // Disable the Aspect
  private disabled: boolean;

  constructor(props: { disabled: boolean } = { disabled: false }) {
    this.disabled = props.disabled;
  }

  visit(node: IConstruct): void {
    if (this.disabled) {
      return;
    }

    if (!(node instanceof CfnResource)) return;
    const skips = this.skipsFor(node);
    if (skips.length) {
      node.addOverride('Metadata.checkov.skip', skips);
    }
  }

  private isCdkInternal(node: CfnResource): boolean {
    const path = node.node.path;
    return CheckovSuppressionAspect.CDK_INTERNAL.some((frag) =>
      path.includes(frag),
    );
  }

  private skipsFor(node: CfnResource): Skip[] {
    const path = node.node.path;
    const internal = this.isCdkInternal(node);

    switch (node.cfnResourceType) {
      case 'AWS::Lambda::Function':
        return internal
          ? [
              {
                id: 'CKV_AWS_115',
                comment:
                  'CDK-internal provider lambda - cannot set reserved concurrency',
              },
              {
                id: 'CKV_AWS_116',
                comment: 'CDK-internal provider lambda - DLQ not applicable',
              },
              {
                id: 'CKV_AWS_117',
                comment: 'CDK-internal provider lambda - cannot place in VPC',
              },
            ]
          : [];

      case 'AWS::IAM::Policy':
        if (node.node.path.includes('CodeBuild')) {
          return [
            {
              id: 'CKV_AWS_111',
              comment:
                'CDK-generated CodeBuild policy — VPC ENI / build wildcards required; non-prod test infra',
            },
          ];
        }
        return [];

      case 'AWS::Logs::LogGroup':
        if (internal) {
          return [
            {
              id: 'CKV_AWS_158',
              comment: 'CDK-internal provider log group - cannot set KMS key',
            },
          ];
        }
        if (path.includes('CodeBuild/BuildLogGroup')) {
          return [
            {
              id: 'CKV_AWS_158',
              comment: 'Ephemeral CodeBuild test logs - CMK not required',
            },
          ];
        }
        return [];

      default:
        return [];
    }
  }
}
