import {
  CfnOutput,
  Duration,
  RemovalPolicy,
  Stack,
  StackProps,
} from 'aws-cdk-lib';
import { UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { Alias, IKey } from 'aws-cdk-lib/aws-kms';
import { Construct } from 'constructs';
import { CodeBuildE2eConstruct } from '../constructs/codebuild-e3e-construct';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from 'aws-cdk-lib/aws-s3';

export interface E2EStackProps extends StackProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly vpc: IVpc;
  readonly codeBuildSecurityGroup: ISecurityGroup;
  readonly kmsKeyAlias: string;
  readonly apiEndpoint: string;
  readonly cognitoDomain: string;
  readonly cognitoEndpoint: string;
  readonly cognitoCient: UserPoolClient;
}

export class E2eStack extends Stack {
  public readonly codebuildProject: CodeBuildE2eConstruct;
  public readonly cognitoSecret: Secret;
  public readonly sourceBucket: Bucket;

  constructor(scope: Construct, id: string, props: E2EStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      vpc,
      codeBuildSecurityGroup,
      kmsKeyAlias,
      cognitoCient,
      cognitoDomain,
      apiEndpoint,
      cognitoEndpoint,
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;


    this.sourceBucket = new Bucket(this, 'SourceBucket', {
      bucketName: `${resourcePrefix}-e2e-source-${this.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      lifecycleRules: [
        {
          expiration: Duration.days(7),
        },
      ],
    });

    this.cognitoSecret = new Secret(this, 'CogntioE2ESecret', {
      secretName: `${resourcePrefix}/e2e/cognito-client`,
      description: `Cognito M2M client secret for E2E tests - ${resourcePrefix}`,
      removalPolicy: RemovalPolicy.DESTROY,
      secretStringValue: cognitoCient.userPoolClientSecret,
    });

    this.codebuildProject = new CodeBuildE2eConstruct(this, 'CodeBuild', {
      developerId,
      environment,
      vpc,
      securityGroups: [codeBuildSecurityGroup],
      apiEndpoint,
      kmsKeyAlias,
      cognitoEndpoint,
      cognitoDomain,
      cognitoClientId: cognitoCient.userPoolClientId,
      cognitoClientSecret: this.cognitoSecret,
      awsRegion: this.region,
      sourceBucket: this.sourceBucket.bucketName,
    });

    new CfnOutput(this, 'CodeBuildProjectName', {
      value: this.codebuildProject.project.projectName,
      description: 'Codebuild project name for E2E tests',
      exportName: `${id}-CodeBuildProjectName`,
    });

    new CfnOutput(this, 'CodeBuildProjectArn', {
      value: this.codebuildProject.project.projectArn,
      description: 'Codebuild project ARN for E2E tests',
      exportName: `${id}-CodeBuildProjectArn`,
    });

    new CfnOutput(this, 'CognitoSecretArn', {
      value: this.cognitoSecret.secretArn,
      description: 'Secret manager Arn E2E client cognito',
      exportName: `${id}-CognitoSecretArn`,
    });

    new CfnOutput(this, 'SourceBucketName', {
      value: this.sourceBucket.bucketName,
      description: 's3 Bucket for codebuild source',
      exportName: `${id}-SourceBucketName`,
    });

    new CfnOutput(this, 'SourcePath', {
      value: `${resourcePrefix}/source.zip`,
      description: 's3 Codebuild Source path',
      exportName: `${id}-SourcePath`,
    });
  }
}
