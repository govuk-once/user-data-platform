import { Stack, StackProps, RemovalPolicy } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';

export class MacieStack extends Stack {
  public readonly macieSlrArn: string;
  public readonly enablement: cr.AwsCustomResource;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.macieSlrArn =
      `arn:${this.partition}:iam::${this.account}:role/aws-service-role/` +
      `macie.amazonaws.com/AWSServiceRoleForAmazonMacie`;

    const macieCrRole = new iam.Role(this, 'MacieCrRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole',
        ),
      ],
    });
    macieCrRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          'macie2:EnableMacie',
          'macie2:UpdateMacieSession',
          'macie2:GetMacieSession',
          'macie2:PutClassificationExportConfiguration',
        ],
        resources: ['*'],
      }),
    );
    macieCrRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['iam:CreateServiceLinkedRole'],
        resources: [this.macieSlrArn],
        conditions: {
          StringLike: { 'iam:AWSServiceName': 'macie.amazonaws.com' },
        },
      }),
    );

    this.enablement = new cr.AwsCustomResource(this, 'EnableMacie', {
      role: macieCrRole,
      onCreate: {
        service: 'macie2',
        action: 'enableMacie',
        parameters: {
          status: 'ENABLED',
          findingPublishingFrequency: 'FIFTEEN_MINUTES',
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `macie-${this.account}-${this.region}`,
        ),
        ignoreErrorCodesMatching: 'ConflictException',
      },
      onUpdate: {
        service: 'macie2',
        action: 'updateMacieSession',
        parameters: {
          status: 'ENABLED',
          findingPublishingFrequency: 'FIFTEEN_MINUTES',
        },
        physicalResourceId: cr.PhysicalResourceId.of(
          `macie-${this.account}-${this.region}`,
        ),
        ignoreErrorCodesMatching: 'ResourceNotFoundException',
      },
    });

    const macieSourceArns = [
      `arn:${this.partition}:macie2:${this.region}:${this.account}:export-configuration:*`,
      `arn:${this.partition}:macie2:${this.region}:${this.account}:classification-job/*`,
    ];
    const confusedDeputy = {
      StringEquals: { 'aws:SourceAccount': this.account },
      ArnLike: { 'aws:SourceArn': macieSourceArns },
    };
    const maciePrincipal = new iam.ServicePrincipal('macie.amazonaws.com');

    const resultsKey = new kms.Key(this, 'ResultsKey', {
      enableKeyRotation: true,
      description: 'Encrypts Macie sensitive data discovery results',
    });
    resultsKey.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowMacieToEncryptResults',
        effect: iam.Effect.ALLOW,
        principals: [maciePrincipal],
        actions: ['kms:GenerateDataKey', 'kms:Encrypt'],
        resources: ['*'],
        conditions: confusedDeputy,
      }),
    );

    const resultsBucket = new s3.Bucket(this, 'ResultsBucket', {
      bucketName: `macie-results-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: resultsKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy: RemovalPolicy.RETAIN,
    });
    resultsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowMacieGetBucketLocation',
        effect: iam.Effect.ALLOW,
        principals: [maciePrincipal],
        actions: ['s3:GetBucketLocation'],
        resources: [resultsBucket.bucketArn],
        conditions: confusedDeputy,
      }),
    );
    resultsBucket.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowMaciePutResults',
        effect: iam.Effect.ALLOW,
        principals: [maciePrincipal],
        actions: ['s3:PutObject'],
        resources: [resultsBucket.arnForObjects('macie-results/*')],
        conditions: confusedDeputy,
      }),
    );

    const exportCall: cr.AwsSdkCall = {
      service: 'macie2',
      action: 'putClassificationExportConfiguration',
      parameters: {
        configuration: {
          s3Destination: {
            bucketName: resultsBucket.bucketName,
            keyPrefix: 'macie-results/',
            kmsKeyArn: resultsKey.keyArn,
          },
        },
      },
      physicalResourceId: cr.PhysicalResourceId.of(
        `macie-export-${this.account}-${this.region}`,
      ),
    };
    const exportConfig = new cr.AwsCustomResource(this, 'ExportConfig', {
      role: macieCrRole,
      onCreate: exportCall,
      onUpdate: exportCall,
    });

    exportConfig.node.addDependency(this.enablement);
    exportConfig.node.addDependency(resultsBucket);
    exportConfig.node.addDependency(resultsKey);
  }
}
