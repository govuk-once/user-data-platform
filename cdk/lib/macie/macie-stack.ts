import { execFileSync } from 'node:child_process';
import { Construct } from 'constructs';
import { Duration, Stack, StackProps, RemovalPolicy, Token } from 'aws-cdk-lib';

import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cr from 'aws-cdk-lib/custom-resources';

import { MacieAccess } from './macie-access';
import { GovUKTag } from '@govuk-connect/tag';
import { Checkov } from '../checkov/checkov';

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
    macieCrRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['s3:PutBucketLogging'],
        resources: [
          `arn:${this.partition}:s3:::macie-results-${this.account}-${this.region}`,
        ],
      }),
    );
    GovUKTag.of(macieCrRole).DataClassification.OFFICIAL_SENSITIVE();

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
    GovUKTag.of(this.enablement)
      .DataClassification.OFFICIAL()
      .PII.FALSE()
      .Exposure.ISOLATED();

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
    GovUKTag.of(resultsKey).DataClassification.OFFICIAL_SENSITIVE();

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
          enforceSSL: true,
          versioned: true,
          removalPolicy: RemovalPolicy.RETAIN,
        });
    GovUKTag.of(resultsBucket)
      .DataClassification.OFFICIAL_SENSITIVE()
      .Exposure.INTERNAL()
      .PII.TRUE();

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
    // The bucket is account-scoped and shared across per environments,
    // retain the policy so PR stacks can be destroyed without affecting other environments' Macie configurations.
    resultsBucketPolicy.applyRemovalPolicy(RemovalPolicy.RETAIN);

    // ── Server access logging for the results bucket (ITHC S3 finding) ──
    // Like the results bucket, the log destination is account-scoped and
    // shared, so it is created once and imported by later stacks.
    const accessLogsBucketName = `macie-results-access-logs-${this.account}-${this.region}`;
    const accessLogsBucketArn = `arn:${this.partition}:s3:::${accessLogsBucketName}`;
    const accessLogsBucket = this.bucketExists(accessLogsBucketName)
      ? undefined
      : new s3.Bucket(this, 'ResultsAccessLogsBucket', {
          bucketName: accessLogsBucketName,
          // Server access log destinations only support SSE-S3.
          encryption: s3.BucketEncryption.S3_MANAGED,
          blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
          // TLS is enforced by the CfnBucketPolicy below; enforceSSL here would
          // create a second, competing policy resource on the same bucket.
          versioned: false,
          removalPolicy: RemovalPolicy.RETAIN,
          lifecycleRules: [{ expiration: Duration.days(360) }],
        });
    if (accessLogsBucket) {
      Checkov.suppressAWS18(accessLogsBucket);
      Checkov.suppressAWS21(accessLogsBucket);
      GovUKTag.of(accessLogsBucket)
        .DataClassification.OFFICIAL()
        .Exposure.INTERNAL()
        .PII.FALSE();
    }

    const accessLogsBucketPolicy = new s3.CfnBucketPolicy(
      this,
      'ResultsAccessLogsBucketPolicy',
      {
        bucket: accessLogsBucketName,
        policyDocument: new iam.PolicyDocument({
          statements: [
            new iam.PolicyStatement({
              sid: 'AllowS3ServerAccessLogDelivery',
              effect: iam.Effect.ALLOW,
              principals: [
                new iam.ServicePrincipal('logging.s3.amazonaws.com'),
              ],
              actions: ['s3:PutObject'],
              resources: [`${accessLogsBucketArn}/access-logs/*`],
              conditions: {
                StringEquals: { 'aws:SourceAccount': this.account },
                ArnLike: { 'aws:SourceArn': bucketArn },
              },
            }),
            new iam.PolicyStatement({
              sid: 'DenyInsecureTransport',
              effect: iam.Effect.DENY,
              principals: [new iam.AnyPrincipal()],
              actions: ['s3:*'],
              resources: [accessLogsBucketArn, `${accessLogsBucketArn}/*`],
              conditions: { Bool: { 'aws:SecureTransport': 'false' } },
            }),
          ],
        }),
      },
    );
    accessLogsBucketPolicy.applyRemovalPolicy(RemovalPolicy.RETAIN);
    // `bucket` is a plain name, not a Ref, so make the ordering explicit.
    if (accessLogsBucket)
      accessLogsBucketPolicy.node.addDependency(accessLogsBucket);

    // Set on the L1 when this stack creates the results bucket, so the
    // template itself declares logging (and Checkov CKV_AWS_18 sees it).
    if (!bucketExists) {
      (resultsBucket.node.defaultChild as s3.CfnBucket).loggingConfiguration = {
        destinationBucketName: accessLogsBucketName,
        logFilePrefix: 'access-logs/',
      };
      resultsBucket.node.addDependency(accessLogsBucketPolicy);
    }

    // The results bucket is usually imported (it pre-dates this change and is
    // shared across stacks), so CloudFormation can't configure it. Apply
    // logging via the API instead; idempotent, and left in place on delete so
    // tearing down one stack doesn't switch logging off for the account.
    const putBucketLogging: cr.AwsSdkCall = {
      service: 's3',
      action: 'putBucketLogging',
      parameters: {
        Bucket: bucketName,
        BucketLoggingStatus: {
          LoggingEnabled: {
            TargetBucket: accessLogsBucketName,
            TargetPrefix: 'access-logs/',
          },
        },
      },
      physicalResourceId: cr.PhysicalResourceId.of(
        `macie-results-logging-${this.account}-${this.region}`,
      ),
    };
    const resultsBucketLogging = new cr.AwsCustomResource(
      this,
      'ResultsBucketLogging',
      {
        role: macieCrRole,
        onCreate: putBucketLogging,
        onUpdate: putBucketLogging,
      },
    );
    resultsBucketLogging.node.addDependency(accessLogsBucketPolicy);
    resultsBucketLogging.node.addDependency(resultsBucket);

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
    GovUKTag.buriedOf(this, 'AWS679f53fac')
      .DataClassification.OFFICIAL()
      .PII.FALSE()
      .Exposure.ISOLATED();

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
      const awsPath = execFileSync('/usr/bin/which', ['aws'], {
        encoding: 'utf8',
      }).trim();
      execFileSync(
        awsPath,
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
        const stderrRaw = (e as { stderr?: unknown }).stderr;
        const stderrStr = typeof stderrRaw === 'string' ? stderrRaw : '';
        const errStr = Buffer.isBuffer(stderrRaw)
          ? stderrRaw.toString('utf8')
          : stderrStr;
        exists = errStr.includes('(403)') || errStr.includes('Forbidden');
      }
    }
    cache.set(name, exists);
    return exists;
  }
}
