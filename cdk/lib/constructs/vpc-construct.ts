import { Construct } from 'constructs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { CfnOutput, RemovalPolicy } from 'aws-cdk-lib';
import { Environment } from 'aws-cdk-lib/aws-appconfig';
import * as kms from 'aws-cdk-lib/aws-kms';

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
  public readonly dynamoDbEnpoint: ec2.GatewayVpcEndpoint;
  public readonly s3Endpoint: ec2.GatewayVpcEndpoint;
  public readonly kmsEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly cognitoEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly cloudwatchEndpoint: ec2.InterfaceVpcEndpoint;
  public readonly excecuteApiEndpoint: ec2.InterfaceVpcEndpoint;

  constructor(scope: Construct, id: string, props: VpcConstructprops) {
    super(scope, id);

    const { environment, vpcCidr = '10.0.0.0/16', maxAzs = 2, kmsKey } = props;

    this.vpc = new ec2.Vpc(this, 'vpc', {
      vpcName: `udp-api-vpc-${environment}`,
      ipAddresses: ec2.IpAddresses.cidr(vpcCidr),
      maxAzs,
      enableDnsHostnames: true,
      enableDnsSupport: true,
      natGateways: 0,
      subnetConfiguration: [
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

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'lambdaSg', {
      vpc: this.vpc,
      securityGroupName: `vpc-lambda-sg-${environment}`,
      description:
        'Security Group for lambda functions in VPC - outbound to VPC only',
      allowAllOutbound: false,
    });

    this.lambdaSecurityGroup.addIngressRule(
      ec2.Peer.ipv4(this.vpc.vpcCidrBlock),
      ec2.Port.tcp(443),
      'Allow Https to VPC Endpoints',
    );

    this.dynamoDbEnpoint = this.vpc.addGatewayEndpoint('dynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
    });

    this.s3Endpoint = this.vpc.addGatewayEndpoint('s3Endpoint', {
      service: ec2.GatewayVpcEndpointAwsService.S3,
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

    const flowLogGroup = new logs.LogGroup(this, 'FlowLogGroup', {
      logGroupName: `/aws/vpc/flow-logs-${environment}`,
      retention: logs.RetentionDays.ONE_MONTH,
      removalPolicy: RemovalPolicy.DESTROY,
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
