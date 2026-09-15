import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const COMPUTE_RESOURCE_PROFILES = defineProfiles({
  LambdaFunction: {
    category: ResourceCategory.COMPUTE,
    label: 'AWS Lambda',
    cfnTypes: ['AWS::Lambda::Function'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  Ec2Instance: {
    category: ResourceCategory.COMPUTE,
    label: 'Amazon EC2 Instances',
    cfnTypes: ['AWS::EC2::Instance'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  EcsTask: {
    category: ResourceCategory.COMPUTE,
    label: 'AWS Fargate / ECS Tasks',
    cfnTypes: ['AWS::ECS::TaskDefinition', 'AWS::ECS::Service'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  BatchJob: {
    category: ResourceCategory.COMPUTE,
    label: 'AWS Batch (Compute & Queues)',
    cfnTypes: [
      'AWS::Batch::ComputeEnvironment',
      'AWS::Batch::JobQueue',
      'AWS::Batch::JobDefinition',
    ],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
});
