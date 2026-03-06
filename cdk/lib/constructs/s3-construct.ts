import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';

export interface S3ConstructProps {
  developerId?: string;
  environment: string;
  bucketName: string;
  kmsKey: kms.IKey;
  vpcId?: string;
}

/**
 * S3 bucket construct for storing SAR files with proper security and encryption
 */
export class S3Construct extends Construct {
  public readonly bucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: S3ConstructProps) {
    super(scope, id);

    const { developerId, environment, bucketName, kmsKey, vpcId } = props;

    const fullBucketName = developerId
      ? `${developerId}-${bucketName}-${environment}`
      : `${bucketName}-${environment}`;

    this.bucket = new s3.Bucket(this, 'Bucket', {
      bucketName: fullBucketName,
      encryption: s3.BucketEncryption.KMS,
      encryptionKey: kmsKey,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      removalPolicy:
        environment === 'dev' ? RemovalPolicy.DESTROY : RemovalPolicy.RETAIN,
      autoDeleteObjects: environment === 'dev',
      lifecycleRules: [
        {
          enabled: true,
          expiration: Duration.days(90), // SAR files expire after 90 days
        },
      ],
    });

    // Restrict bucket access to VPC if VPC is provided
    if (vpcId) {
      this.bucket.addToResourcePolicy(
        new iam.PolicyStatement({
          sid: 'DenyAccessFromOutsideVPC',
          effect: iam.Effect.DENY,
          principals: [new iam.AnyPrincipal()],
          actions: ['s3:*'],
          resources: [this.bucket.bucketArn, `${this.bucket.bucketArn}/*`],
          conditions: {
            StringNotEquals: {
              'aws:SourceVpc': vpcId,
            },
            BoolIfExists: {
              'aws:ViaAWSService': 'false',
            },
          },
        }),
      );
    }
  }
}
