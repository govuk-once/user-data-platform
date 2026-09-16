import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const MESSAGING_AND_WORKFLOWS_RESOURCE_PROFILES = defineProfiles({
  SqsQueue: {
    category: ResourceCategory.MESSAGING_AND_WORKFLOWS,
    label: 'Amazon SQS Queues',
    cfnTypes: ['AWS::SQS::Queue'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  SnsTopic: {
    category: ResourceCategory.MESSAGING_AND_WORKFLOWS,
    label: 'Amazon SNS Topics',
    cfnTypes: ['AWS::SNS::Topic'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  EventBus: {
    category: ResourceCategory.MESSAGING_AND_WORKFLOWS,
    label: 'Amazon EventBridge Event Buses',
    cfnTypes: ['AWS::Events::EventBus'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  StateMachine: {
    category: ResourceCategory.MESSAGING_AND_WORKFLOWS,
    label: 'AWS Step Functions State Machines',
    cfnTypes: ['AWS::StepFunctions::StateMachine'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
});
