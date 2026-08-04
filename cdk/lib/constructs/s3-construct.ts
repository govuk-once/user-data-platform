import { Construct } from 'constructs';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

import { getRemovalPolicy } from 'cdk/constants/environment';
import { MacieAccess } from '../macie/macie-access';

export interface S3ConstructProps {
  developerId?: string;
  environment: string;
  bucketName: string;
  kmsKey: kms.IKey;
  vpcId?: string;
  deploymentRoleArn?: string;
}

/**
 * S3 bucket construct for storing SAR files with proper security and encryption
 */
export class S3Construct extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3ConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      bucketName,
      kmsKey,
      vpcId,
      deploymentRoleArn,
    } = props;

    const fullBucketName = developerId
      ? `${developerId}-${bucketName}-${environment}`
      : `${bucketName}-${environment}`;

    const enableAutoDelete = environment === 'dev';

    const accessLogsBucket = new s3.Bucket(this, 'AccessLogsBucket', {
      bucketName: `${fullBucketName}-access-logs`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy: getRemovalPolicy(environment),
      autoDeleteObjects: enableAutoDelete,
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(360),
        },
      ],
    });

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: fullBucketName,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      bucketKeyEnabled: true,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy:
        environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: enableAutoDelete,
      serverAccessLogsBucket: accessLogsBucket,
      serverAccessLogsPrefix: 'access-logs/',
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(90), // SAR files expire after 90 days
        },
      ],
    });

    // Restrict bucket access to VPC if VPC is provided
    // Note: VPC restrictions are incompatible with autoDeleteObjects since the
    // CDK cleanup Lambda runs outside the VPC. Only apply in production.
    // Deny only plain-actions so cloudforamation can still manage bucket configuration
    if (vpcId && deploymentRoleArn && !enableAutoDelete) {
      this.bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'DenyAccessFromOutsideVPC',
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: [
            's3:GetObject',
            's3:GetObject*',
            's3:PutObject',
            's3:DeleteObject',
            's3:DeleteObject*',
            's3:ListBucket',
            's3:ListBucket*',
            's3:Abort*',
          ],
          resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
          conditions: {
            StringNotEquals: {
              'aws:SourceVpc': vpcId,
              'aws:PrincipalArn': MacieAccess.slrArn(this),
            },
            ArnNotLike: {
              'aws:PrincipalArn': [deploymentRoleArn],
            },
          },
        }),
      );
    }
  }
}
