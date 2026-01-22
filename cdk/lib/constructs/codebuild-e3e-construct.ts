import { Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  BuildEnvironmentVariableType,
  BuildSpec,
  Cache,
  ComputeType,
  IBuildImage,
  LinuxBuildImage,
  LocalCacheMode,
  Project,
  Source,
} from 'aws-cdk-lib/aws-codebuild';
import { ISecurityGroup, IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import { PolicyStatement, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface CodeBuildE2eConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly vpc: IVpc;
  readonly securityGroups: ISecurityGroup[];
  readonly kmsKey: IKey;
  readonly kmsKeyAlias: string;
  readonly apiEndpoint: string;
  readonly cognitoDomain: string;
  readonly cognitoClientSecret: ISecret;
  readonly cognitoClientId: string;
  readonly awsRegion: string;
  readonly buildTimeout?: Duration;
  readonly sourceBucket: string;
  readonly cognitoEndpoint?: string;
}

export class CodeBuildE2eConstruct extends Construct {
  public readonly project: Project;
  public readonly logGroup: LogGroup;

  constructor(scope: Construct, id: string, props: CodeBuildE2eConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      vpc,
      securityGroups,
      kmsKey,
      kmsKeyAlias,
      apiEndpoint,
      cognitoClientId,
      cognitoClientSecret,
      cognitoDomain,
      awsRegion,
      buildTimeout = Duration.minutes(30),
      sourceBucket,
      cognitoEndpoint,
    } = props;

    const stack = Stack.of(this);
    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    this.logGroup = new LogGroup(this, 'BuildLogGroup', {
      logGroupName: `/aws/codebuild/${resourcePrefix}-e2e-cucumber-tests`,
      retention: RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
      encryptionKey: kmsKey,
    });

    const codebuildRole = new Role(this, 'CodeBuildRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      description: `Iam role for E2e Codebuild Project - ${resourcePrefix}`,
    });

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'CloudwatchLogs',
        actions: [
          'logs:CreateLogGroup',
          'logs:CreateLogStream',
          'logs:PutLogEvents',
        ],
        resources: [
          this.logGroup.logGroupArn,
          `${this.logGroup.logGroupArn}:*`,
        ],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'VpcNetworking',
        actions: [
          'ec2:CreateNetweorkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecuriyGroups',
          'ec2:DescribeDhcOptions',
          'ec2:DescribeVpcs',
        ],
        resources: ['*'],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'CreateNetworkInterfacePermission',
        actions: ['ec2:CreateNetworkInterfacePermission'],
        resources: [
          `arn:aws:ec2:${awsRegion}:${stack.account}:network-interface/*`,
        ],
        conditions: {
          StringEquals: {
            'ec2:AuthorizedService': 'codebuild.amazonaws.com',
          },
        },
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'SecretManagerRead',
        actions: [
          'secretsmanager:GetSecretValue',
          'secretsmanager:DescribeSecret',
        ],
        resources: [cognitoClientSecret.secretArn],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'KMSDecrypt',
        actions: ['kms:Decrypt', 'kms:GenerateDataKeys*'],
        resources: [`arn:aws:kms:${awsRegion}:${stack.account}:${kmsKeyAlias}`],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'ECRAuth',
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'ECRPull',
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: ['*'],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'CodeBuildReports',
        actions: [
          'codebuild:CreateReportGroup',
          'codebuild:CreateReport',
          'codebuild:UpdateReport',
          'codebuild:BatchTestCases',
          'codebuild:BatchPutCodeCoverages',
        ],
        resources: [
          `arn:aws:codebuild:${awsRegion}:${stack.account}:report-group/${resourcePrefix}=e2e-*`,
        ],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'S3SourceAccess',
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [`arn:aws:s3:::${sourceBucket}/*`],
      }),
    );

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'S3BucketAccess',
        actions: ['s3:GetBucketLocation', 's3:ListBucket'],
        resources: [`arn:aws:s3:::${sourceBucket}`],
      }),
    );

    const source = Source.s3({
      bucket: Bucket.fromBucketName(this, 'SourceBucket', sourceBucket),
      path: `${resourcePrefix}/source.zip`,
    });

    this.project = new Project(this, 'E2eProject', {
      projectName: `${resourcePrefix}-e2e-cucumber-tests`,
      description: `Runs Cucumber e3e tests in vpc for ${resourcePrefix}`,
      source,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.SMALL,
        privileged: false,
        environmentVariables: {
          API_BASE_URL: { value: apiEndpoint },
          COGNITO_DOMAIN: { value: cognitoDomain },
          COGNITO_CLIENT_FLEX_ID: { value: cognitoClientId },
          COGNITO_TOKEN_ENDPOINT: { value: cognitoEndpoint },
          COGNITO_CLIENT_FLEX_SECRET: {
            type: BuildEnvironmentVariableType.SECRETS_MANAGER,
            value: cognitoClientSecret.secretArn,
          },
          COGNITO_CLIENT_FLEX_SCOPES: {
            value: 'udp/read udp/write udp/delete',
          },
          COGNITO_DEFAULT_CLIENT: { value: 'flex' },
          AWS_REGION: { value: awsRegion },
          DEBUG: { value: 'false' },
        },
      },
      vpc,
      subnetSelection: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups,
      buildSpec: BuildSpec.fromSourceFilename('cdk/buildspec.yml'),
      logging: {
        cloudWatch: {
          logGroup: this.logGroup,
        },
      },
      timeout: buildTimeout,
      cache: Cache.local(LocalCacheMode.SOURCE),
      role: codebuildRole,
    });
  }
}
