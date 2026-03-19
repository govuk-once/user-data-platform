import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import * as kms from 'aws-cdk-lib/aws-kms';
import { getLogRetentionPeriod, getRemovalPolicy } from 'cdk/constants/environment';
import { AnyPrincipal, PolicyStatement } from 'aws-cdk-lib/aws-iam';

export interface VpcConstructprops {
  readonly environment: string;
  readonly vpcCidr?: string;
  readonly maxAzs?: number;
  readonly kmsKey?: kms.IKey;
}

export class VpcConstuct extends Construct {
  public readonly vpc: ec2.Vpc;
  public readonly vpcEndpointSecurityGroup: ec2.SecurityGroup;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly dynamoDbEndpoint: ec2.GatewayVpcEndpoint;
  public readonly s3Endpoint: ec2.GatewayVpcEndpoint;
  public readonly kmsEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly cognitoEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly cloudwatchEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly excecuteApiEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly codebuildSecurityGroup: ec2.SecurityGroup;
  public readonly codeBuildEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly ecrApiEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly secretsManagerEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly sqsEndpoint: ec2.InterfaceVpcEndpoint;

  constructor(scope: Construct, id: string, props: VpcConstructprops) {
    super(scope, id);

    const { environment, vpcCidr = '10.0.0.0/16', maxAzs = 2, kmsKey } = props;

    this.vpc = new ec2.Vpc(this, 'vpc', {
      vpcName: `udp-api-vpc-${environment}`,
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 1, // single nat gateway for e2e tests
      subnetConfiguration: [
        {
          name: 'public',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'private-egres',
          subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
          cidrMask: 24,
        },
        {
          name: 'private',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 24,
        },
      ],
    });

    this.vpcEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      'vpcEndpointSg',
      {
        vpc: this.vpc,
        securityGroupName: `vpc-endpoint-sg-${environment}`,
        description:
          'Security Group for VPC endpoint - allows https from VPC CIDR',
        allowAllOutbound: true,
      },
    );

    this.vpcEndpointSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow Https From VPC CIDR',
    );

    this.dynamoDbEndpoint = this.vpc.addGatewayEndpoint('dynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    this.dynamoDbEndpoint.addToPolicy(
      new PolicyStatement({
        principals: [new AnyPrincipal()],
        actions: [
          'dynamodb:BatchGetItem',
          'dynamodb:BatchWriteItem',
          'dynamodb:DeleteItem',
          'dynamodb:DescribeTable',
          'dynamodb:GetItem',
          'dynamodb:PutItem',
          'dynamodb:Query',
          'dynamodb:Scan',
          'dynamodb:UpdateItem',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:PrincipalAccount': Stack.of(this).account,
          },
        },
      }),
    );

    this.s3Endpoint = this.vpc.addGatewayEndpoint('s3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    this.s3Endpoint.addToPolicy(
      new PolicyStatement({
        principals: [new AnyPrincipal()],
        actions: [
          's3:GetObject',
          's3:GetObjectVersion',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
          's3:GetBucketLocation',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:PrincipalAccount': Stack.of(this).account,
          },
        },
      }),
    );

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'lambdaSg', {
      vpc: this.vpc,
      securityGroupName: `vpc-lambda-sg-${environment}`,
      description:
        'Security Group for lambda functions in VPC - outbound to VPC only',
      allowAllOutbound: false,
    });

    this.lambdaSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.udp(53),
      'Allow DNS (tcp) to vcp resolver',
    );

    this.lambdaSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(53),
      'Allow DNS (tcp) to vcp resolver',
    );

    this.lambdaSecurityGroup.addIngressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow HTTPS to VPC endpoints',
    );

    this.lambdaSecurityGroup.addEgressRule(
      this.vpcEndpointSecurityGroup,
      ec2.Port.tcp(443),
      'Allow HTTPS to VPC interface endpoints',
    );

    this.lambdaSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.udp(53),
      'Allow DNS (UDP) to VPC resolver',
    );

    this.lambdaSecurityGroup.addEgressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(53),
      'Allow DNS (TCP) to VPC resolver',
    );

    this.lambdaSecurityGroup.addEgressRule(
      ec2.Peer.anyIpv4(),
      ec2.Port.tcp(443),
      'Allow Http outbound to gateway endpoints',
    );

    this.vpcEndpointSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(443),
      'Allow Http from lambda security group',
    );

    this.codebuildSecurityGroup = new ec2.SecurityGroup(this, 'CodeBuildSG', {
      vpc: this.vpc,
      securityGroupName: `codebuild-sg-${environment}`,
      description: 'Security group for CodeBuild with NAT gateway access',
      allowAllOutbound: true,
    });

    this.kmsEndpoint = this.vpc.addInterfaceEndpoint('kmsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      securityGroups: [this.vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    this.excecuteApiEndpoint = this.vpc.addInterfaceEndpoint(
      'ExcecuteApiEndpoint',
      {
        service: ec2.InterfaceVpcEndpointAwsService.APIGATEWAY,
        securityGroups: [this.vpcEndpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      },
    );

    this.cognitoEndpoint = this.vpc.addInterfaceEndpoint('CognitoIdpEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.COGNITO_IDP,
      securityGroups: [this.vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    this.cloudwatchEndpoint = this.vpc.addInterfaceEndpoint(
      'CloudwatchEndpoint',
      {
        service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
        securityGroups: [this.vpcEndpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      },
    );

    this.codeBuildEndpoint = this.vpc.addInterfaceEndpoint(
      'CodeBuildEndpoint',
      {
        service: ec2.InterfaceVpcEndpointAwsService.CODEBUILD,
        securityGroups: [this.vpcEndpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      },
    );

    this.ecrApiEndpoint = this.vpc.addInterfaceEndpoint('EcrApiEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.ECR,
      securityGroups: [this.vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    this.secretsManagerEndpoint = this.vpc.addInterfaceEndpoint(
      'SecretManagerEndpoint',
      {
        service: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
        securityGroups: [this.vpcEndpointSecurityGroup],
        privateDnsEnabled: true,
        subnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      },
    );

    this.sqsEndpoint = this.vpc.addInterfaceEndpoint('SqsEnpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.SQS,
      securityGroups: [this.vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    const flowLogGroup = new logs.LogGroup(this, 'FlowLogGroup', {
      logGroupName: `/aws/vpc/flow-logs-${environment}`,
      retention: getLogRetentionPeriod(environment),
      removalPolicy: getRemovalPolicy(environment),
      encryptionKey: kmsKey,
    });

    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });

    new CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });

    new CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC Cidr Block',
    });

    new CfnOutput(this, 'excecuteApiEnpointId', {
      value: this.excecuteApiEndpoint.vpcEndpointId,
      description: 'VPC Endpoint Id for Api Gateway execute-api',
    });
  }
}
