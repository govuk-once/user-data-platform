import { Duration, Stack } from 'aws-cdk-lib';
import {
  BuildEnvironmentVariableType,
  BuildSpec,
  Cache,
  ComputeType,
  LinuxBuildImage,
  LocalCacheMode,
  Project,
  Source,
} from 'aws-cdk-lib/aws-codebuild';
import { ISecurityGroup, IVpc, SubnetType } from 'aws-cdk-lib/aws-ec2';
import {
  IRole,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { LogGroup } from 'aws-cdk-lib/aws-logs';
import { Bucket } from 'aws-cdk-lib/aws-s3';
import {
  getLogRetentionPeriod,
  getRemovalPolicy,
} from 'cdk/constants/environment';
import { Construct } from 'constructs';

export interface CodeBuildPerfConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly vpc: IVpc;
  readonly securityGroups: ISecurityGroup[];
  readonly apiEndpoint: string;
  readonly awsRegion: string;
  readonly buildTimeout?: Duration;
  readonly sourceBucket: string;
  readonly apiId: string;
  readonly e2eTestConsumerRole?: IRole;
  readonly e2eTestConsumerApiKeyValue?: string;
  readonly identityTableName: string;
  readonly dataTableName: string;
}

export class CodeBuildPerfConstruct extends Construct {
  public readonly project: Project;
  public readonly logGroup: LogGroup;

  constructor(
    scope: Construct,
    id: string,
    props: CodeBuildPerfConstructProps,
  ) {
    super(scope, id);

    const {
      developerId,
      environment,
      vpc,
      securityGroups,
      apiEndpoint,
      awsRegion,
      buildTimeout = Duration.minutes(30),
      sourceBucket,
      apiId,
      e2eTestConsumerRole,
      e2eTestConsumerApiKeyValue,
      identityTableName,
      dataTableName,
    } = props;

    const stack = Stack.of(this);
    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    this.logGroup = new LogGroup(this, 'BuildLogGroup', {
      logGroupName: `/aws/codebuild/${resourcePrefix}-perf-tests`,
      retention: getLogRetentionPeriod(environment),
      removalPolicy: getRemovalPolicy(environment),
    });

    const codeBuildRole = new Role(this, 'CodeBuildRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      description: `IAM role for Performance Test Codebuild Project - ${resourcePrefix}`,
    });

    codeBuildRole.addToPolicy(
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

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'CloudWatchPutMetrics',
        actions: ['cloudwatch:PutMetricData'],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'cloudwatch:namespace': 'UDP/PerformanceTests',
          },
        },
      }),
    );

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'VpcNetworking',
        actions: [
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeDhcOptions',
          'ec2:DescribeVpcs',
        ],
        resources: ['*'],
      }),
    );

    codeBuildRole.addToPolicy(
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

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'ApiGatewayInvoke',
        actions: ['execute-api:Invoke'],
        resources: [
          `arn:aws:execute-api:${awsRegion}:${stack.account}:${apiId}/*`,
        ],
      }),
    );

    if (e2eTestConsumerRole) {
      codeBuildRole.addToPolicy(
        new PolicyStatement({
          sid: 'AssumeE2ETestRole',
          actions: ['sts:AssumeRole'],
          resources: [e2eTestConsumerRole.roleArn],
        }),
      );
    }

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'KMSDecrypt',
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey*'],
        resources: ['*'],
      }),
    );

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'ECRAuth',
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      }),
    );

    codeBuildRole.addToPolicy(
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

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'S3SourceAccess',
        actions: ['s3:GetObject', 's3:GetObjectVersion'],
        resources: [`arn:aws:s3:::${sourceBucket}/*`],
      }),
    );

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'S3BucketAccess',
        actions: ['s3:GetBucketLocation', 's3:ListBucket'],
        resources: [`arn:aws:s3:::${sourceBucket}`],
      }),
    );

    codeBuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'DynamoDBSeedWrite',
        actions: [
          'dynamodb:BatchWriteItem',
          'dynamodb:PutItem',
          'dynamodb:DescribeTable',
        ],
        resources: [
          `arn:aws:dynamodb:${awsRegion}:${stack.account}:table/${identityTableName}`,
          `arn:aws:dynamodb:${awsRegion}:${stack.account}:table/${dataTableName}`,
        ],
      }),
    );

    const source = Source.s3({
      bucket: Bucket.fromBucketName(this, 'SourceBucket', sourceBucket),
      path: `${resourcePrefix}/source.zip`,
    });

    const environmentVariables: Record<
      string,
      { value: string; type?: BuildEnvironmentVariableType }
    > = {
      API_BASE_URL: { value: apiEndpoint },
      AWS_REGION: { value: awsRegion },
      PERF_TARGET: { value: 'smoke' },
      ENVIRONMENT: { value: environment },
      IDENTITY_TABLE_NAME: { value: identityTableName },
      DYNAMODB_TABLE_NAME: { value: dataTableName },
    };

    if (e2eTestConsumerApiKeyValue) {
      environmentVariables.API_KEY = {
        value: e2eTestConsumerApiKeyValue,
      };
    }

    this.project = new Project(this, 'PerfProject', {
      projectName: `${resourcePrefix}-perf-tests`,
      description: `Runs k6 performance tests in VPC for ${resourcePrefix}`,
      source,
      environment: {
        buildImage: LinuxBuildImage.STANDARD_7_0,
        computeType: ComputeType.SMALL,
        privileged: false,
        environmentVariables,
      },
      vpc,
      subnetSelection: { subnetType: SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups,
      buildSpec: BuildSpec.fromSourceFilename('cdk/buildspec-perf.yml'),
      logging: {
        cloudWatch: {
          logGroup: this.logGroup,
        },
      },
      timeout: buildTimeout,
      cache: Cache.local(LocalCacheMode.SOURCE),
      role: codeBuildRole,
    });
  }
}
