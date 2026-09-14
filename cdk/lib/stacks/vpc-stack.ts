import { Construct } from 'constructs';
import { Stack, StackProps, CfnOutput } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { VpcConstruct } from '../constructs/vpc-construct';
import { KmsConstruct } from '../constructs/kms-construct';

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
  public readonly dynamoDbEndpointUrl: string;

  constructor(scope: Construct, id: string, props: VpcStackProps) {
    super(scope, id, props);

    const {
      environment,
      vpcCidr,
      maxAzs,
      // enablePrivateLink = false,
      // privateLinkAllowedPrincipalArns = [],
    } = props;

    const kmsConstruct = new KmsConstruct(this, 'kms', {
      environment,
      namePrefix: 'vpc',
    });

    const vpcConstuct = new VpcConstruct(this, 'vpc', {
      environment,
      vpcCidr,
      maxAzs,
      kmsKey: kmsConstruct.key,
    });

    this.vpc = vpcConstuct.vpc;
    this.vpcEndpointSecurityGroup = vpcConstuct.vpcEndpointSecurityGroup;
    this.lambdaSecurityGroup = vpcConstuct.lambdaSecurityGroup;
    this.executeApiEndpointId = vpcConstuct.executeApiEndpoint.vpcEndpointId;
    this.codeBuildSecurityGroup = vpcConstuct.codebuildSecurityGroup;
    this.dynamoDbEndpointUrl = vpcConstuct.dynamoDbEndpointUrl;

    new CfnOutput(this, 'VpcIdOutput', {
      value: this.vpc.vpcId,
      exportName: `${id}-vpcId`,
      description: 'VPC ID for cross stack reference',
    });

    new CfnOutput(this, 'VpcEndpointSecurityGroupIdOutput', {
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
      exportName: `${id}-ExecuteApiEndpointId`,
      description: 'VPC Endpoint ID for api gateway excecute-api',
    });

    const privateSubnets = vpcConstuct.vpc.isolatedSubnets;
    privateSubnets.forEach((subnet, idx) => {
      new CfnOutput(this, `PrivateSubnet${idx}IdOutput`, {
        value: subnet.subnetId,
        exportName: `${id}-PrivateSubnet${idx}Id`,
        description: `Private subnet ${idx} ID`,
      });
    });

    // Keep the legacy PRIVATE_WITH_EGRESS subnet exports while existing stacks
    // still import them. These can be removed once all consumers are redeployed.
    const privateEgressSubnets = vpcConstuct.vpc.selectSubnets({
      subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
    }).subnets;

    const legacySubnetExports = [
      'ExportsOutputRefvpcprivateegresSubnet1Subnet319674287A1BCE93',
      'ExportsOutputRefvpcprivateegresSubnet2Subnet9B57F6B4D663C64E',
    ];

    legacySubnetExports.forEach((legacyOutputId, index) => {
      const output = new CfnOutput(
        this,
        `LegacyPrivateEgressSubnet${index + 1}`,
        {
          value: privateEgressSubnets[index].subnetId,
          exportName: `${this.stackName}:${legacyOutputId}`,
        },
      );
      output.overrideLogicalId(legacyOutputId);
    });
  }
}
