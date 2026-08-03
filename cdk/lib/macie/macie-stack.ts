import { execFileSync } from 'node:child_process';
import { Construct } from 'constructs';
import { Stack, StackProps, RemovalPolicy, Token } from 'aws-cdk-lib';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';

import { MacieAccess } from './macie-access';

const cache = new Map<string, boolean>();

export class MacieStack extends Stack {
  public readonly enablement: cr.AwsCustomResource;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

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
        resources: [MacieAccess.slrArn(this)],
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

    const bucketName = `macie-results-${this.account}-${this.region}`;
    const bucketArn = `arn:${this.partition}:s3:::${bucketName}`;
    const bucketExists = this.bucketExists(bucketName);

    const resultsBucket: s3.IBucket = bucketExists
      ? s3.Bucket.fromBucketName(this, 'ResultsBucket', bucketName)
      : new s3.Bucket(this, 'ResultsBucket', {
          bucketName,
          encryption: s3.BucketEncryption.KMS,
          encryptionKey: resultsKey,
          bucketKeyEnabled: true,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          enforceSSL: true,
          versioned: true,
          removalPolicy: RemovalPolicy.RETAIN,
        });

    const resultsBucketPolicy = new s3.CfnBucketPolicy(
      this,
      'ResultsBucketPolicy',
      {
        bucket: bucketName,
        policyDocument: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'AllowMacieGetBucketLocation',
              effect: iam.Effect.ALLOW,
              principals: [maciePrincipal],
              actions: ['s3:GetBucketLocation'],
              resources: [bucketArn],
              conditions: confusedDeputy,
            }),
            new iam.PolicyStatement({
              sid: 'AllowMaciePutResults',
              effect: iam.Effect.ALLOW,
              principals: [maciePrincipal],
              actions: ['s3:PutObject'],
              resources: [`${bucketArn}/macie-results/*`],
              conditions: confusedDeputy,
            }),
            new iam.PolicyStatement({
              sid: 'DenyInsecureTransport',
              effect: iam.Effect.DENY,
              principals: [new iam.AnyPrincipal()],
              actions: ['s3:*'],
              resources: [bucketArn, `${bucketArn}/*`],
              conditions: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
          ],
        }),
      },
    );

    const exportCall: cr.AwsSdkCall = {
      service: 'macie2',
      action: 'putClassificationExportConfiguration',
      parameters: {
        configuration: {
          s3Destination: {
            bucketName,
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
    exportConfig.node.addDependency(resultsBucketPolicy);
    exportConfig.node.addDependency(resultsBucket);
    exportConfig.node.addDependency(resultsKey);
  }

  private bucketExists(name: string): boolean {
    if (Token.isUnresolved(this.region)) {
      throw new Error(
        'MacieStack requires an explicit env (account/region) for bucket lookup',
      );
    }
    const cached = cache.get(name);
    if (cached !== undefined) return cached;

    let exists: boolean = false;
    try {
      execFileSync(
        'aws',
        ['s3api', 'head-bucket', '--bucket', name, '--region', this.region],
        { stdio: 'pipe' },
      );
      exists = true;
    } catch (e: unknown) {
      if (
        typeof e === 'object' &&
        e !== null &&
        ('stdout' in e || 'stderr' in e)
      ) {
        const err =
          e instanceof Error
            ? String(
                (
                  e as NodeJS.ErrnoException & {
                    stderr?: unknown;
                    stdout?: unknown;
                  }
                ).stderr ?? '',
              )
            : String(e);
        exists = err.includes('(403)') || err.includes('Forbidden');
      }
    }
    cache.set(name, exists);

    return exists;
  }
}
