import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const NETWORKING_AND_API_RESOURCE_PROFILES = defineProfiles({
  Vpc: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'Amazon VPC',
    cfnTypes: ['AWS::EC2::VPC'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  VpcSubnet: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'VPC Subnets',
    cfnTypes: ['AWS::EC2::Subnet'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  SecurityGroup: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'Security Groups',
    cfnTypes: ['AWS::EC2::SecurityGroup'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  VpcEndpoint: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'VPC Endpoints',
    cfnTypes: ['AWS::EC2::VPCEndpoint'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  ApiGateway: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'Amazon API Gateway',
    cfnTypes: ['AWS::ApiGateway::RestApi', 'AWS::ApiGatewayV2::Api'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  AppSyncApi: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'AWS AppSync (GraphQL)',
    cfnTypes: ['AWS::AppSync::GraphQLApi'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  CloudFrontDistribution: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'Amazon CloudFront Distributions',
    cfnTypes: ['AWS::CloudFront::Distribution'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  Route53HostedZone: {
    category: ResourceCategory.NETWORKING_AND_API,
    label: 'Amazon Route 53 Hosted Zones',
    cfnTypes: ['AWS::Route53::HostedZone'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
});
