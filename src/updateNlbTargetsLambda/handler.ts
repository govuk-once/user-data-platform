import {
  EC2Client,
  DescribeNetworkInterfacesCommand,
  DescribeVpcEndpointsCommand,
} from '@aws-sdk/client-ec2';

import {
  ElasticLoadBalancingV2Client,
  DescribeTargetHealthCommand,
  RegisterTargetsCommand,
  DeregisterTargetsCommand,
} from '@aws-sdk/client-elastic-load-balancing-v2';

const ec2 = new EC2Client({});
const elbv2 = new ElasticLoadBalancingV2Client({});

export const handler = async () => {
  const vpcEndpointId = process.env.VPC_ENDPOINT_ID!;
  const targetGroupArn = process.env.TARGET_GROU_ARN!;

  const endpointResponse = await ec2.send(
    new DescribeVpcEndpointsCommand({
      VpcEndpointIds: [vpcEndpointId],
    }),
  );

  if (!endpointResponse.VpcEndpoints?.length) {
    return { statusCode: 404, body: 'VPC endpoint not found' };
  }

  const eniIds = endpointResponse.VpcEndpoints[0].NetworkInterfaceIds ?? [];

  if (!eniIds.length) {
    return { statusCode: 200, body: 'No ENIs found' };
  }

  const enisResponse = await ec2.send(
    new DescribeNetworkInterfacesCommand({
      NetworkInterfaceIds: eniIds,
    }),
  );

  const newIps = new Set<string>();
  for (const eni of enisResponse.NetworkInterfaces ?? []) {
    if (eni.PrivateIpAddress) {
      newIps.add(eni.PrivateIpAddress);
    }
  }

  const currentTargetsResponse = elbv2.send(
    new DescribeTargetHealthCommand({
      TargetGroupArn: targetGroupArn,
    }),
  );

  const currentIps = new Set<string>();
  for (const desc of (await currentTargetsResponse).TargetHealthDescriptions ??
    []) {
    if (desc.Target?.Id) {
      currentIps.add(desc.Target.Id);
    }
  }

  const ipsToAdd = [...newIps].filter((ip) => !currentIps.has(ip));
  const ipsToRemove = [...currentIps].filter((ip) => !newIps.has(ip));

  if (ipsToRemove.length) {
    await elbv2.send(
      new DeregisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: ipsToRemove.map((ip) => ({ Id: ip, Port: 443 })),
      }),
    );
  }

  if (ipsToAdd.length) {
    await elbv2.send(
      new RegisterTargetsCommand({
        TargetGroupArn: targetGroupArn,
        Targets: ipsToRemove.map((ip) => ({ Id: ip, Port: 443 })),
      }),
    );
  }

  if (!ipsToAdd.length && !ipsToRemove.length) {
    console.log('no changes required');
  }

  return {
    statusCode: 200,
    body: 'update targets',
  };
};
