import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { VpcConstuct } from '../constructs/vpc-construct';

export interface VpcStackProps extends StackProps {
  readonly environment: string;
  readonly vpcCidr?: string;
  readonly maxAzs?: number;
}

export class VpcStack extends Stack {
  public readonly vpc: ec2.Vpc;
  public readonly vpcEndpointSecurityGroup: ec2.SecurityGroup;
  public readonly lambdaSecurityGroup: ec2.SecurityGroup;
  public readonly executeApiEndpointId: string;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const { environment, vpcCidr, maxAzs } = props;

    const vpcConstruct = new VpcConstuct(this, 'vpc', {
      environment,
      vpcCidr,
      maxAzs,
    });

    this.vpc = vpcConstruct.vpc;
    this.vpcEndpointSecurityGroup = vpcConstruct.vpcEndpointSecurityGroup;
    this.lambdaSecurityGroup = vpcConstruct.lambdaSecurityGroup;
    this.executeApiEndpointId = vpcConstruct.excecuteApiEndpoint.vpcEndpointId;

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
  }
}
