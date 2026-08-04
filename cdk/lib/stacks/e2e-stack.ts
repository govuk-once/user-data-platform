import { CfnOutput, Duration, Stack, StackProps } from 'aws-cdk-lib';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import { CodeBuildE2eConstruct } from '../constructs/codebuild-e3e-construct';
import {
  BlockPublicAccess,
  Bucket,
  BucketEncryption,
} from 'aws-cdk-lib/aws-s3';
import {
  getRemovalPolicy,
  GovUkOnceEnvironments,
} from 'cdk/constants/environment';
import { IRole } from 'aws-cdk-lib/aws-iam';

export interface E2EStackProps extends StackProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly vpc: IVpc;
  readonly codeBuildSecurityGroup: ISecurityGroup;
  readonly kmsKeyAlias: string;
  readonly apiEndpoint: string;
  readonly apiId: string;
  readonly e2eTestConsumerRole?: IRole;
  readonly e2eTestConsumerApiKeyValue?: string;
  readonly identityTableName: string;
  readonly kmsKeyArn?: string;
}

export class E2eStack extends Stack {
  public readonly codebuildProject: CodeBuildE2eConstruct;
  public readonly sourceBucket: Bucket;

  constructor(scope: Construct, id: string, props: E2EStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      vpc,
      codeBuildSecurityGroup,
      kmsKeyAlias,
      apiEndpoint,
      apiId,
      e2eTestConsumerRole,
      e2eTestConsumerApiKeyValue,
      identityTableName,
      kmsKeyArn,
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    this.sourceBucket = new Bucket(this, 'SourceBucket', {
      bucketName: `${resourcePrefix}-e2e-source-${this.account}`,
      encryption: BucketEncryption.S3_MANAGED,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: false,
      removalPolicy: getRemovalPolicy(environment),
      autoDeleteObjects: environment === GovUkOnceEnvironments.Dev,
      lifecycleRules: [
        {
          expiration: Duration.days(7),
        },
      ],
    });

    this.codebuildProject = new CodeBuildE2eConstruct(this, 'CodeBuild', {
      developerId,
      environment,
      vpc,
      securityGroups: [codeBuildSecurityGroup],
      apiEndpoint,
      kmsKeyAlias,
      apiId,
      awsRegion: this.region,
      sourceBucket: this.sourceBucket.bucketName,
      e2eTestConsumerRole,
      e2eTestConsumerApiKeyValue,
      identityTableName,
      kmsKeyArn,
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
