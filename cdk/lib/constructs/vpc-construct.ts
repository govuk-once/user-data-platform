import { Construct } from 'constructs';
import { CfnOutput, Stack } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

import {
  getLogRetentionPeriod,
  getRemovalPolicy,
  GovUkOnceEnvironments,
} from 'cdk/constants/environment';

export interface VpcConstructProps {
  readonly environment: string;
  readonly vpcCidr?: string;
  readonly maxAzs?: number;
  readonly kmsKey?: kms.IKey;
}

const ADMIN_PORTS: Record<string, { port: number; ruleNumber: number }> = {
  SSH: { port: 22, ruleNumber: 50 },
  RDP: { port: 3389, ruleNumber: 51 },
  // Other Admin ports to consider...
  // Telnet: { port: 23, ruleNumber: 52 },
  // AltWebAdmin8080: { port: 8080, ruleNumber: 53 },
  // AltWebAdmin8443: { port: 8443, ruleNumber: 54 },
  // WebminControlPanel: { port: 10000, ruleNumber: 54 },
};

export class VpcConstruct extends Construct {
  public vpc!: ec2.Vpc;
  public vpcEndpointSecurityGroup!: ec2.SecurityGroup;
  public lambdaSecurityGroup!: ec2.SecurityGroup;
  public dynamoDbEndpoint!: ec2.GatewayVpcEndpoint;
  public s3Endpoint!: ec2.GatewayVpcEndpoint;
  public kmsEndpoint!: ec2.InterfaceVpcEndpoint;
  public cognitoEndpoint!: ec2.InterfaceVpcEndpoint;
  public cloudwatchEndpoint!: ec2.InterfaceVpcEndpoint;
  public executeApiEndpoint!: ec2.InterfaceVpcEndpoint;
  public codebuildSecurityGroup!: ec2.SecurityGroup;
  public codeBuildEndpoint!: ec2.InterfaceVpcEndpoint;
  public ecrApiEndpoint!: ec2.InterfaceVpcEndpoint;
  public secretsManagerEndpoint!: ec2.InterfaceVpcEndpoint;
  public sqsEndpoint!: ec2.InterfaceVpcEndpoint;
  public nacl!: ec2.NetworkAcl;
  public publicNacl!: ec2.NetworkAcl;
  public flowLogGroup!: logs.LogGroup;
  private readonly stack: Stack;
  private environment: string;
  private maxAzs: number | undefined;
  private kmsKey: kms.IKey | undefined;
  private vpcCidr: string;

  constructor(scope: Construct, id: string, props: VpcConstructProps) {
    super(scope, id);

    this.stack = Stack.of(this);

    this.environment = props.environment;
    this.maxAzs = props.maxAzs ?? 2;
    this.vpcCidr = props.vpcCidr ?? '10.0.0.0/16';
    this.kmsKey = props.kmsKey;

    /**
     * VPC
     * TODO: detailed comments on VPC setup
     */
    this.setupVPC();

    /**
     * Gateway Endpoints (S3, DynamoDB)
     * TODO: detailed comments on Gateway Endpoints
     */
    this.setupGatewayEndpoints();

    /**
     * Lambda Security Group and Rules
     * TODO: detailed comments on Lambda Security Group and Rules
     */
    this.setupLambdaSecurityGroup();

    /**
     * Codebuild Security Group
     * TODO: detailed comments on Codebuild Security Group
     */
    this.setupcCodebuildSecurityGroup();

    /**
     * VPC Endpoints
     * TODO: detailed comments on VPC Endpoints
     */
    this.setupVpcEndpoints();

    /**
     * Private / Isolated NACL
     * TODO: detailed comments on Private / Isolated NACL
     */
    this.setupPrivateIsolatedNacl();

    /**
     * Public NACL
     * TODO: detailed comments on Public NACL
     */
    this.setupPublicNacl();

    /**
     * Flow Log Group
     * TODO: detailed comments on Flow Log Group
     */
    this.setupLogGroup();

    /**
     * Outputs
     */
    this.emitOutputs();
  }

  private setupVPC() {
    this.vpc = new ec2.Vpc(this, 'vpc', {
      vpcName: `udp-api-vpc-${this.environment}`,
      ipAddresses: ec2.IpAddresses.cidr(this.vpcCidr),
      maxAzs: this.maxAzs,
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

    // VPC Security Group and Rules
    this.vpcEndpointSecurityGroup = new ec2.SecurityGroup(
      this,
      'vpcEndpointSg',
      {
        vpc: this.vpc,
        securityGroupName: `vpc-endpoint-sg-${this.environment}`,
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
  }

  private setupGatewayEndpoints() {
    this.dynamoDbEndpoint = this.vpc.addGatewayEndpoint('dynamoDbEndpoint', {
      service: ec2.GatewayVpcEndpointAwsService.DYNAMODB,
      subnets: [
        { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
        { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      ],
    });

    this.dynamoDbEndpoint.addToPolicy(
      new iam.PolicyStatement({
        principals: [new iam.AnyPrincipal()],
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
            'aws:PrincipalAccount': this.stack.account,
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
      new iam.PolicyStatement({
        principals: [new iam.AnyPrincipal()],
        actions: [
          's3:GetObject',
          's3:GetObjectVersion',
          's3:PutObject',
          's3:DeleteObject',
          's3:ListBucket',
          's3:GetBucketLocation',
          's3:GetBucketAcl',
        ],
        resources: ['*'],
        conditions: {
          StringEquals: {
            'aws:PrincipalAccount': this.stack.account,
          },
        },
      }),
    );
  }

  private setupLambdaSecurityGroup() {
    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, 'lambdaSg', {
      vpc: this.vpc,
      securityGroupName: `vpc-lambda-sg-${this.environment}`,
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
  }

  private setupcCodebuildSecurityGroup() {
    this.codebuildSecurityGroup = new ec2.SecurityGroup(this, 'CodeBuildSG', {
      vpc: this.vpc,
      securityGroupName: `codebuild-sg-${this.environment}`,
      description: 'Security group for CodeBuild with NAT gateway access',
      allowAllOutbound: true,
    });
  }

  private setupVpcEndpoints() {
    this.kmsEndpoint = this.vpc.addInterfaceEndpoint('kmsEndpoint', {
      service: ec2.InterfaceVpcEndpointAwsService.KMS,
      securityGroups: [this.vpcEndpointSecurityGroup],
      privateDnsEnabled: true,
      subnets: {
        subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
      },
    });

    this.executeApiEndpoint = this.vpc.addInterfaceEndpoint(
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
  }

  private setupPrivateIsolatedNacl() {
    this.nacl = new ec2.NetworkAcl(this, 'RestrictedNacl', {
      vpc: this.vpc,
      networkAclName: `udp-restricted-nacl-${this.environment}`,
    });

    for (const [service, config] of Object.entries(ADMIN_PORTS)) {
      this.nacl.addEntry(`DenyInbound${service}`, {
        ruleNumber: config.ruleNumber,
        cidr: ec2.AclCidr.anyIpv4(),
        traffic: ec2.AclTraffic.tcpPort(config.port),
        direction: ec2.TrafficDirection.INGRESS,
        ruleAction: ec2.Action.DENY,
      });
    }

    this.nacl.addEntry('AllowAllInbound', {
      ruleNumber: 100,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.INGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    this.nacl.addEntry('AllowAllOutbound', {
      ruleNumber: 100,
      cidr: ec2.AclCidr.anyIpv4(),
      traffic: ec2.AclTraffic.allTraffic(),
      direction: ec2.TrafficDirection.EGRESS,
      ruleAction: ec2.Action.ALLOW,
    });

    this.vpc.privateSubnets.forEach((subnet, index) => {
      new ec2.SubnetNetworkAclAssociation(
        this,
        `PrivateSubnetNaclAssoc${index}`,
        {
          subnet,
          networkAcl: this.nacl,
        },
      );
    });

    this.vpc.isolatedSubnets.forEach((subnet, index) => {
      new ec2.SubnetNetworkAclAssociation(
        this,
        `IsolatedSubnetNaclAssoc${index}`,
        {
          subnet,
          networkAcl: this.nacl,
        },
      );
    });
  }

  private setupPublicNacl() {
    this.publicNacl = new ec2.NetworkAcl(this, 'RestrictedPublicNacl', {
      vpc: this.vpc,
      networkAclName: `udp-restricted-public-nacl-${this.environment}`,
    });

    for (const [service, config] of Object.entries(ADMIN_PORTS)) {
      this.publicNacl.addEntry(`DenyInbound${service}`, {
        ruleNumber: config.ruleNumber,
        cidr: ec2.AclCidr.anyIpv4(),
        traffic: ec2.AclTraffic.tcpPort(config.port),
        direction: ec2.TrafficDirection.INGRESS,
        ruleAction: ec2.Action.DENY,
      });
    }

    // A Custom NACL to allow performance tests to run on dev and stage
    // if (this.environment !== GovUkOnceEnvironments.Prod) {
    //   this.publicNacl.addEntry('AllowInboundFromVpc', {
    //     ruleNumber: 100,
    //     cidr: ec2.AclCidr.ipv4(this.vpcCidr),
    //     traffic: ec2.AclTraffic.allTraffic(),
    //     direction: ec2.TrafficDirection.INGRESS,
    //     ruleAction: ec2.Action.ALLOW,
    //   });

    //   this.publicNacl.addEntry('AllowInboundEphemeral', {
    //     ruleNumber: 110,
    //     cidr: ec2.AclCidr.anyIpv4(),
    //     traffic: ec2.AclTraffic.tcpPortRange(1024, 65535),
    //     direction: ec2.TrafficDirection.INGRESS,
    //     ruleAction: ec2.Action.ALLOW,
    //   });

    //   this.publicNacl.addEntry('AllowAllOutbound', {
    //     ruleNumber: 100,
    //     cidr: ec2.AclCidr.anyIpv4(),
    //     traffic: ec2.AclTraffic.allTraffic(),
    //     direction: ec2.TrafficDirection.EGRESS,
    //     ruleAction: ec2.Action.ALLOW,
    //   });
    // }

    this.vpc.publicSubnets.forEach((subnet, index) => {
      new ec2.SubnetNetworkAclAssociation(
        this,
        `PublicSubnetNaclAssoc${index}`,
        {
          subnet,
          networkAcl: this.publicNacl,
        },
      );
    });
  }

  private setupLogGroup() {
    this.flowLogGroup = new logs.LogGroup(this, 'FlowLogGroup', {
      logGroupName: `/aws/vpc/flow-logs-${this.environment}`,
      retention: getLogRetentionPeriod(this.environment),
      removalPolicy: getRemovalPolicy(this.environment),
      encryptionKey: this.kmsKey,
    });

    this.vpc.addFlowLog('FlowLog', {
      destination: ec2.FlowLogDestination.toCloudWatchLogs(this.flowLogGroup),
      trafficType: ec2.FlowLogTrafficType.ALL,
    });
  }

  private emitOutputs() {
    new CfnOutput(this, 'VpcId', {
      value: this.vpc.vpcId,
      description: 'VPC ID',
    });

    new CfnOutput(this, 'VpcCidr', {
      value: this.vpc.vpcCidrBlock,
      description: 'VPC Cidr Block',
    });

    new CfnOutput(this, 'excecuteApiEnpointId', {
      value: this.executeApiEndpoint.vpcEndpointId,
      description: 'VPC Endpoint Id for Api Gateway execute-api',
    });
  }
}
