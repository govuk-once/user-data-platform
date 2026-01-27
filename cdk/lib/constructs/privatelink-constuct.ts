import { CfnOutput, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import {
  IInterfaceVpcEndpoint,
  ISecurityGroup,
  IVpc,
  SubnetType,
  VpcEndpointService,
} from 'aws-cdk-lib/aws-ec2';
import {
  NetworkLoadBalancer,
  NetworkTargetGroup,
  Protocol,
  TargetType,
} from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { ArnPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import {
  AwsCustomResource,
  AwsCustomResourcePolicy,
  PhysicalResourceId,
  Provider,
} from 'aws-cdk-lib/custom-resources';
import { Construct } from 'constructs';
import path from 'path';

export interface PrivateLinkConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly vpc: IVpc;
  readonly vpcEndpoint: IInterfaceVpcEndpoint;
  readonly vpcEndpointSecurityGroup: ISecurityGroup;
  readonly allowedPrincipalArns?: string[];
  readonly acceptanceRequired?: boolean;
  readonly kmsKey?: IKey;
}

export class PrivateLinkConstruct extends Construct {
  public readonly nlb: NetworkLoadBalancer;
  public readonly endpointService: VpcEndpointService;
  public readonly targetGroup: NetworkTargetGroup;
  public readonly updateTargetLambda: Function;

  constructor(scope: Construct, id: string, props: PrivateLinkConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      vpc,
      vpcEndpoint,
      vpcEndpointSecurityGroup,
      allowedPrincipalArns = [],
      acceptanceRequired = true,
      kmsKey,
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-privatelink`
      : 'privatelink';

    const account = Stack.of(this).account;
    const region = Stack.of(this).region;

    this.nlb = new NetworkLoadBalancer(this, 'Nlb', {
      vpc,
      loadBalancerName: `${resourcePrefix}-${environment}`,
      internetFacing: false,
      crossZoneEnabled: true,
      vpcSubnets: { subnetType: SubnetType.PRIVATE_ISOLATED },
    });

    this.targetGroup = new NetworkTargetGroup(this, 'TargetGroup', {
      vpc,
      port: 443,
      protocol: Protocol.TCP,
      targetType: TargetType.IP,
      healthCheck: {
        enabled: true,
        protocol: Protocol.TCP,
        port: '443',
        interval: Duration.seconds(30),
        healthyThresholdCount: 3,
        unhealthyThresholdCount: 3,
      },
      deregistrationDelay: Duration.seconds(30),
    });

    this.nlb.addListener('TCPListener', {
      port: 443,
      protocol: Protocol.TCP,
      defaultTargetGroups: [this.targetGroup],
    });

    const lambdaLogGroup = new LogGroup(this, 'UpdateTargetsLogGroup', {
      logGroupName: `/aws/lambda/${resourcePrefix}-update-nlb-targets-${environment}`,
      retention: RetentionDays.ONE_WEEK,
      removalPolicy: RemovalPolicy.DESTROY,
      encryptionKey: kmsKey,
    });

    this.updateTargetLambda = new Function(this, 'UpdateTargetLambda', {
      functionName: `${resourcePrefix}-update-nlb-targets-${environment}`,
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      timeout: Duration.minutes(1),
      memorySize: 128,
      logGroup: lambdaLogGroup,
      environment: {
        VPC_ENDPOINT_ID: vpcEndpoint.vpcEndpointId,
        TARGET_GROUP_ARN: this.targetGroup.targetGroupArn,
      },
      code: Code.fromAsset(
        path.resolve(process.cwd(), '..', 'build', 'updateNlbTargetsLambda'),
      ),
    });

    this.updateTargetLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [`ec2:DescribeVpcEndpoints`, `ec2:DescribeNetworkInterfaces`],
        resources: ['*'],
      }),
    );

    this.updateTargetLambda.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          `elasticloadbalancing:RegisterTargets`,
          'elastivloadbalancing:DeregisterTargets',
          `elasticloadbalancing:DescribeTargetHealth`,
        ],
        resources: [this.targetGroup.targetGroupArn],
      }),
    );

    const eniChangeRule = new Rule(this, 'EniChangeRule', {
      ruleName: `${resourcePrefix}-eni-change-${environment}`,
      description: 'Trigger NLB target update when vpc endpoint ENIs change',
      eventPattern: {
        source: ['aws:ec3'],
        detailType: ['AWS API Call via CloudTrail'],
        detail: {
          eventSource: ['ec2.amazonaws.com'],
          eventName: [
            `CreateNetworkInterface`,
            `DeleteNetworkInterface`,
            `ModifyNetworkInterfaceAttribute`,
          ],
        },
      },
    });

    eniChangeRule.addTarget(new LambdaFunction(this.updateTargetLambda));

    const initialUodateProvider = new Provider(this, 'InitialUpdateProvider', {
      onEventHandler: this.updateTargetLambda,
    });

    new AwsCustomResource(this, 'InitialTargetUpdate', {
      onCreate: {
        service: 'lambda',
        action: 'invoke',
        parameters: {
          FunctionName: this.updateTargetLambda.functionName,
          InvocationType: 'Event',
        },
        physicalResourceId: PhysicalResourceId.of('InitialTargetUpdate'),
      },
      onUpdate: {
        service: 'lambda',
        action: 'invoke',
        parameters: {
          FunctionName: this.updateTargetLambda.functionName,
          InvocationType: 'Event',
        },
        physicalResourceId: PhysicalResourceId.of('InitialTargetUpdate'),
      },
      policy: AwsCustomResourcePolicy.fromStatements([
        new PolicyStatement({
          actions: ['lambda:InvokeFunction'],
          resources: [this.updateTargetLambda.functionArn],
        }),
      ]),
    });

    const allowedPrincipals = allowedPrincipalArns.map(
      (arn) => new ArnPrincipal(arn),
    );

    this.endpointService = new VpcEndpointService(this, 'EndpointService', {
      vpcEndpointServiceLoadBalancers: [this.nlb],
      acceptanceRequired,
      allowedPrincipals:
        allowedPrincipals.length > 0 ? allowedPrincipals : undefined,
    });

    new CfnOutput(this, 'EndpointServiceName', {
      value: this.endpointService.vpcEndpointServiceName,
      description: `VPC Endpoint service name for external account to connect`,
    });
    new CfnOutput(this, 'NlbArn', {
      value: this.nlb.loadBalancerArn,
      description: `Network load balancer Arn`,
    });
    new CfnOutput(this, 'NlbDnsName', {
      value: this.nlb.loadBalancerDnsName,
      description: `Network load balancer Dns Name`,
    });

    new CfnOutput(this, 'EndpointServiceId', {
      value: this.endpointService.vpcEndpointServiceId,
      description: `VPC Endpoint service ID for external account to connect`,
    });
  }
}
