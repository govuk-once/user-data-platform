import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { getRemovalPolicy } from 'cdk/constants/environment';

export interface KmsConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly namePrefix?: string;
  readonly deletionWindowInDays?: number;
  readonly enableKeyRotation?: boolean;
  readonly rotationPeriodInDays?: number;
}

export class KmsConstruct extends Construct {
  public readonly key: kms.IKey;
  public readonly alias: kms.Alias;

  constructor(scope: Construct, id: string, props: KmsConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      namePrefix = 'encryption',
      deletionWindowInDays = 30,
      enableKeyRotation = true,
      rotationPeriodInDays = 90,
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${namePrefix}`
      : namePrefix;

    const account = Stack.of(this).account;
    const region = Stack.of(this).region;

    this.key = new kms.Key(this, 'Key', {
      description: `${resourcePrefix}-${environment} encryption key`,
      enableKeyRotation,
      rotationPeriod: Duration.days(rotationPeriodInDays),
      pendingWindow: Duration.days(deletionWindowInDays),
      removalPolicy: getRemovalPolicy(environment),
      alias: `${resourcePrefix}-${environment}`,
    });

    this.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowIAMPolicies',
        effect: iam.Effect.ALLOW,
        principals: [new iam.AccountRootPrincipal()],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
        ],
        resources: ['*'],
      }),
    );

    this.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowLambdaService',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
        resources: ['*'],
      }),
    );

    this.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudwatchLogs',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal(`logs.${region}.amazonaws.com`)],
        actions: [
          'kms:Encrypt*',
          'kms:Decrypt*',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kma:Describe*',
        ],
        resources: ['*'],
        conditions: {
          ArnLike: {
            'kms:EncryptionContext:aws:logs:arn': `arn:aws:logs:${region}:${account}:*`,
          },
        },
      }),
    );

    this.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudwatchAlarms',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('cloudwatch.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:GenerateDataKeys'],
        resources: ['*'],
      }),
    );

    this.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowSNSService',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('sns.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:GenerateDataKeys'],
        resources: ['*'],
      }),
    );

    this.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowCloudwatchLogs',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal(`logs.${region}.amazonaws.com`)],
        actions: [
          'kms:Encrypt*',
          'kms:Decrypt*',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:Describe*',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'kms.callerAccount': account,
          },
        },
      }),
    );

    this.alias = this.key.node.findChild('Alias') as kms.Alias;
  }
}
