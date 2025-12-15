import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';

export interface KmsConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly namePrefix?: string;
  readonly deletionWindowInDays?: number;
  readonly enableKeyRotation?: boolean;
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
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${namePrefix}`
      : namePrefix;

    const account = Stack.of(this).account;
    const region = Stack.of(this).region;

    this.key = new kms.Key(this, 'Key', {
      description: `${resourcePrefix}-${environment} encryption key`,
      enableKeyRotation,
      pendingWindow: Duration.days(deletionWindowInDays),
      removalPolicy: RemovalPolicy.DESTROY,
      alias: `${resourcePrefix}-${environment}`,
    });

    this.key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowLambdaService',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ServicePrincipal('lambda.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:GenerateDataKeys*'],
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

    this.alias = this.key.node.findChild('Alias') as kms.Alias;
  }
}
