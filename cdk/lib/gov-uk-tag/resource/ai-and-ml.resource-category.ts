import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const AI_AND_ML_RESOURCE_PROFILES = defineProfiles({
  Bedrock: {
    category: ResourceCategory.AI_AND_ML,
    label: 'Amazon Bedrock (Inference/Knowledge Bases/Agents)',
    cfnTypes: [
      'AWS::Bedrock::Agent',
      'AWS::Bedrock::KnowledgeBase',
      'AWS::Bedrock::Guardrail',
      'AWS::Bedrock::ApplicationInferenceProfile',
    ],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  SageMaker: {
    category: ResourceCategory.AI_AND_ML,
    label: 'Amazon SageMaker (Notebooks/Endpoints/Jobs)',
    cfnTypes: [
      'AWS::SageMaker::NotebookInstance',
      'AWS::SageMaker::Endpoint',
      'AWS::SageMaker::EndpointConfig',
      'AWS::SageMaker::Model',
      'AWS::SageMaker::Domain',
    ],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  KendraIndex: {
    category: ResourceCategory.AI_AND_ML,
    label: 'Amazon Kendra (Search Indexes)',
    cfnTypes: ['AWS::Kendra::Index'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  QBusiness: {
    category: ResourceCategory.AI_AND_ML,
    label: 'Amazon Q Business / Apps',
    cfnTypes: ['AWS::QBusiness::Application', 'AWS::QBusiness::Index'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
});
