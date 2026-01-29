import { Construct } from 'constructs';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

import { CfnOutput, Fn, Stack } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { getRemovalPolicy } from 'cdk/constants/environment';

export interface ApiGatewayConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly apiName?: string;
  readonly vpcEndpointIds: string[];
  readonly crossAccountPrincipals?: string[];
  readonly throttlingBurstLimit?: number;
  readonly throttlingRateLimit?: number;
  readonly enableAccessLogs?: boolean;
  readonly kmsKey?: kms.IKey;
  readonly cachingEnabled?: boolean;
  readonly cacheClusterSize?: string;
}

const role =
  'service-role/AmazonApiGatewayPushToCloudwatchLogs'; /* pragma: allowlist-secret */

export class ApiGatewayConstruct extends Construct {
  public readonly api: apigateway.RestApi;
  public readonly logGroup?: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      apiName = 'api',
      vpcEndpointIds,
      crossAccountPrincipals,
      throttlingBurstLimit = 100,
      throttlingRateLimit = 50,
      enableAccessLogs = true,
      kmsKey,
      cachingEnabled = false,
      cacheClusterSize = '0.5',
    } = props;

    const fullApiName = developerId
      ? `${developerId}-${apiName}-${environment}-test`
      : `${apiName}-${environment}`;

    const policyStatements: iam.PolicyStatement[] = [
      // Deny all access not from VPC endpoints
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['execute-api:Invoke'],
        resources: ['execute-api/*'],
        conditions: {
          StringNotEquals: {
            'aws:sourceVpce': vpcEndpointIds,
          },
        },
      }),
      // allow access from VPC endponts
      new iam.PolicyStatement({
        effect: iam.Effect.DENY,
        principals: [new iam.AnyPrincipal()],
        actions: ['execute-api:Invoke'],
        resources: ['execute-api/*'],
      }),
    ];

    if (crossAccountPrincipals && crossAccountPrincipals?.length > 0) {
      policyStatements.push(
        new iam.PolicyStatement({
          effect: iam.Effect.ALLOW,
          principals: crossAccountPrincipals?.map(
            (accountId) => new iam.AccountPrincipal(accountId),
          ),
          actions: ['execute-api:Invoke'],
          resources: ['execute-api/*'],
        }),
      );
    }

    const resourcePolicy = new iam.PolicyDocument({
      statements: policyStatements,
    });

    const vpcEndpoints = vpcEndpointIds.map((endpointId, index) =>
      ec2.InterfaceVpcEndpoint.fromInterfaceVpcEndpointAttributes(
        this,
        `VpcEndpoint${index}`,
        {
          vpcEndpointId: endpointId,
          port: 443,
        },
      ),
    );

    const cloudwatchLogRole = new iam.Role(this, 'CloudwatchRole', {
      assumedBy: new iam.ServicePrincipal('apigateway.amazonaws.com'),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName(role)],
    });

    const account = new apigateway.CfnAccount(this, 'ApiGatewayAccount', {
      cloudWatchRoleArn: cloudwatchLogRole.roleArn,
    });

    if (enableAccessLogs) {
      this.logGroup = new logs.LogGroup(this, 'AccessLogs', {
        logGroupName: `/aws/apigateway/${fullApiName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: getRemovalPolicy(environment),
        encryptionKey: kmsKey,
      });
    }

    this.api = new apigateway.RestApi(this, 'HttpApi', {
      restApiName: fullApiName,
      description: `Http api for ${fullApiName}`,
      endpointConfiguration: {
        types: [apigateway.EndpointType.PRIVATE],
        vpcEndpoints,
      },
      policy: resourcePolicy,
      deployOptions: {
        stageName: environment,
        throttlingBurstLimit,
        throttlingRateLimit,
        accessLogDestination: this.logGroup
          ? new apigateway.LogGroupLogDestination(this.logGroup)
          : undefined,
        accessLogFormat: apigateway.AccessLogFormat.jsonWithStandardFields({
          caller: true,
          httpMethod: true,
          ip: true,
          protocol: true,
          requestTime: true,
          resourcePath: true,
          responseLength: true,
          status: true,
          user: true,
        }),
        loggingLevel: apigateway.MethodLoggingLevel.INFO,
        dataTraceEnabled: false,
        metricsEnabled: true,
        tracingEnabled: true,
        cachingEnabled,
        cacheClusterEnabled: cachingEnabled,
        cacheClusterSize: cachingEnabled ? cacheClusterSize : undefined,
      },

      disableExecuteApiEndpoint: false,
    });

    this.api.node.addDependency(account);

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway endpoint URL',
    });

    new CfnOutput(this, 'ApiId', {
      value: this.api.restApiId,
      description: 'RestAPi ID',
    });
  }

  get stageArn(): string {
    const stack = Stack.of(this);
    return Fn.join('', [
      'arn:',
      stack.partition,
      ':apigateway:',
      stack.region,
      '::/restapis/',
      this.api.restApiId,
      '/stages/',
      this.api.deploymentStage.stageName,
    ]);
  }

  get executeArn(): string {
    return this.api.arnForExecuteApi();
  }
}
