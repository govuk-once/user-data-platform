import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { VpcConstuct } from '../constructs/vpc-construct';
import { KmsConstruct } from '../constructs/kms-construct';
import { PrivateLinkConstruct } from '../constructs/privatelink-constuct';

export interface VpcStackProps extends StackProps {
  readonly environment: string;
  readonly vpcCidr?: string;
  readonly maxAzs?: number;
  readonly enablePrivateLink?: boolean;
  readonly privateLinkAllowedPrincipalArns?: string[];
}

export class VpcStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly vpcEndpointSecurityGroup: ec2.SecurityGroup;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly executeApiEndpointId: string;
  public readonly codeBuildSecurityGroup: ec2.SecurityGroup;
  public readonly privateLinkServiceName?: string;
  public readonly privateLinkServiceId?: string;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const {
      environment,
      vpcCidr,
      maxAzs,
      enablePrivateLink = false,
      privateLinkAllowedPrincipalArns = [],
    } = props;

    const kmsConstruct = new KmsConstruct(this, 'kms', {
      environment,
      namePrefix: 'vpc',
    });

    const vpcConstruct = new VpcConstuct(this, 'vpc', {
      environment,
      vpcCidr,
      maxAzs,
      kmsKey: kmsConstruct.key,
    });

    this.vpc = vpcConstruct.vpc;
    this.vpcEndpointSecurityGroup = vpcConstruct.vpcEndpointSecurityGroup;
    this.lambdaSecurityGroup = vpcConstruct.lambdaSecurityGroup;
    this.executeApiEndpointId = vpcConstruct.excecuteApiEndpoint.vpcEndpointId;
    this.codeBuildSecurityGroup = vpcConstruct.codebuildSecurityGroup;

    new CfnOutput(this, 'CpvIdOutput', {
      value: this.vpc.vpcId,
      exportName: `${id}-vpcId`,
      description: 'VPC ID for cross stack reference',
    });

    new CfnOutput(this, 'VpcEnpointSecurityGroupIdOutput', {
      value: this.vpcEndpointSecurityGroup.securityGroupId,
      exportName: `${id}-vpcEndpointSecurityGroupId`,
      description: 'Security group id for VPC Endpoints',
    });

    new CfnOutput(this, 'lambdaSecurityGroupIdOutput', {
      value: this.lambdaSecurityGroup.securityGroupId,
      exportName: `${id}-lambdaSecurityGroupId`,
      description: 'Security group id for VPC Lambda Functions',
    });

    new CfnOutput(this, 'ExcexuteApiEndpointIdOutput', {
      value: this.executeApiEndpointId,
      exportName: `${id}-ExcexuteApiEndpointId`,
      description: 'VPC Endpoint ID for api gateway excecute-api',
    });

    const privateSubnets = vpcConstruct.vpc.isolatedSubnets;
    privateSubnets.forEach((subnet, idx) => {
      new CfnOutput(this, `PrivateSubnet${idx}IdOutput`, {
        value: subnet.subnetId,
        exportName: `${id}-PrivateSubnet${idx}Id`,
        description: `Private subnet ${idx} ID`,
      });
    });

    if (enablePrivateLink) {
      const privatelink = new PrivateLinkConstruct(this, 'PrivateLink', {
        environment,
        vpc: vpcConstruct.vpc,
        vpcEndpoint: vpcConstruct.excecuteApiEndpoint,
        vpcEncpointSecurityGroup: vpcConstruct.vpcEndpointSecurityGroup,
        allowedPrincipalArns: privateLinkAllowedPrincipalArns,
        acceptanceRequired: true,
        kmsKey: kmsConstruct.key,
      });

      this.privateLinkServiceName =
        privatelink.endpointService.vpcEndpointServiceName;
      this.privateLinkServiceId =
        privatelink.endpointService.vpcEndpointServiceId;

      new CfnOutput(this, `PrivateLinkServiceNameOutput`, {
        value: privatelink.endpointService.vpcEndpointServiceName,
        exportName: `${id}-PrivateLinkServiceName`,
        description: `VPC endpoint service name for externl consumers`,
      });

      new CfnOutput(this, `PrivateLinkServiceIdOutput`, {
        value: privatelink.endpointService.vpcEndpointServiceId,
        exportName: `${id}-PrivateLinkServiceId`,
        description: `VPC endpoint service ID`,
      });
    }
  }
}
