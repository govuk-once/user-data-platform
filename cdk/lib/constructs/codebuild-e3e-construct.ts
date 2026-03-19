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
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { getLogRetentionPeriod, getRemovalPolicy } from 'cdk/constants/environment';
import { Construct } from 'constructs';

export interface CodeBuildE2eConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly vpc: IVpc;
  readonly securityGroups: ISecurityGroup[];
  readonly apiEndpoint: string;
  readonly awsRegion: string;
  readonly buildTimeout?: Duration;
  readonly sourceBucket: string;
  readonly cognitoEndpoint?: string;
  readonly kmsKeyAlias?: string;
  readonly consumerConfigSecret?: ISecret;
  readonly apiId: string;
  readonly e2eTestConsumerRole?: IRole;
  readonly identityTableName: string;
  readonly kmsKeyArn?: string;
  readonly e2eTestConsumerApiKeyValue?: string;
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
      apiEndpoint,
      awsRegion,
      buildTimeout = Duration.minutes(30),
      sourceBucket,
      consumerConfigSecret,
      apiId,
      e2eTestConsumerRole,
      identityTableName,
      kmsKeyArn,
      e2eTestConsumerApiKeyValue,
    } = props;

    const stack = Stack.of(this);
    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    this.logGroup = new LogGroup(this, 'BuildLogGroup', {
      logGroupName: `/aws/codebuild/${resourcePrefix}-e2e-cucumber-tests`,
      retention: getLogRetentionPeriod(environment),
      removalPolicy: getRemovalPolicy(environment),
    });

    const codebuildRole = new Role(this, 'CodeBuildRole', {
      assumedBy: new ServicePrincipal('codebuild.amazonaws.com'),
      description: `IAM role for E2E Codebuild Project - ${resourcePrefix}`,
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
          'ec2:CreateNetworkInterface',
          'ec2:DescribeNetworkInterfaces',
          'ec2:DeleteNetworkInterface',
          'ec2:DescribeSubnets',
          'ec2:DescribeSecurityGroups',
          'ec2:DescribeDhcpOptions',
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
        sid: 'ApiGatewayInvoke',
        actions: ['execute-api:Invoke'],
        resources: [
          `arn:aws:execute-api:${awsRegion}:${stack.account}:${apiId}/*`,
        ],
      }),
    );

    if (identityTableName) {
      codebuildRole.addToPolicy(
        new PolicyStatement({
          sid: 'DynamoDBCleanup',
          actions: ['dynamodb:Query', 'dynamodb:DeleteItem'],
          resources: [
            `arn:aws:dynamodb:${awsRegion}:${stack.account}:table/${identityTableName}`,
          ],
        }),
      );
    }

    if (e2eTestConsumerRole) {
      codebuildRole.addToPolicy(
        new PolicyStatement({
          sid: 'AssumeE2ETestRole',
          actions: ['sts:AssumeRole'],
          resources: [e2eTestConsumerRole.roleArn],
        }),
      );
    }

    const secretArns: string[] = [];
    if (consumerConfigSecret) {
      secretArns.push(consumerConfigSecret.secretArn);
    }

    if (secretArns.length > 0) {
      codebuildRole.addToPolicy(
        new PolicyStatement({
          sid: 'SecretManagerRead',
          actions: [
            'secretsmanager:GetSecretValue',
            'secretsmanager:DescribeSecret',
          ],
          resources: secretArns,
        }),
      );
    }

    codebuildRole.addToPolicy(
      new PolicyStatement({
        sid: 'KMSDecrypt',
        actions: ['kms:Decrypt', 'kms:DescribeKey', 'kms:GenerateDataKey*'],
        resources: ['*'],
      }),
    );

    if (kmsKeyArn) {
      codebuildRole.addToPolicy(
        new PolicyStatement({
          sid: 'KMSRotateKey',
          actions: ['kms:RotateKeyOnDemand'],
          resources: [kmsKeyArn],
        }),
      );
    }

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
          `arn:aws:codebuild:${awsRegion}:${stack.account}:report-group/${resourcePrefix}-e2e-*`,
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

    const environmentVariables: Record<
      string,
      { value: string; type?: BuildEnvironmentVariableType }
    > = {
      API_BASE_URL: { value: apiEndpoint },
      AWS_REGION: { value: awsRegion },
      IDENTITY_TABLE_NAME: { value: identityTableName },
      DEBUG: { value: 'false' },
    };

    if (e2eTestConsumerApiKeyValue) {
      environmentVariables.API_KEY = {
        value: e2eTestConsumerApiKeyValue,
      };
    }

    if (consumerConfigSecret) {
      environmentVariables.CONSUMER_CONFIG_SECRET_ARN = {
        value: consumerConfigSecret.secretArn,
      };
    }

    if (kmsKeyArn) {
      environmentVariables.KMS_KEY_ARN = {
        value: kmsKeyArn,
      };
    }

    this.project = new Project(this, 'E2eProject', {
      projectName: `${resourcePrefix}-e2e-cucumber-tests`,
      description: `Runs Cucumber E2E tests in VPC for ${resourcePrefix}`,
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
