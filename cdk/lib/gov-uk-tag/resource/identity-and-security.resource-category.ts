import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const IDENTITY_AND_SECURITY_RESOURCE_PROFILES = defineProfiles({
  CognitoUserPool: {
    category: ResourceCategory.IDENTITY_AND_SECURITY,
    label: 'Amazon Cognito User Pools',
    cfnTypes: ['AWS::Cognito::UserPool'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  Secret: {
    category: ResourceCategory.IDENTITY_AND_SECURITY,
    label: 'AWS Secrets Manager',
    cfnTypes: ['AWS::SecretsManager::Secret'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  SsmParameter: {
    category: ResourceCategory.IDENTITY_AND_SECURITY,
    label: 'Systems Manager Parameter Store',
    cfnTypes: ['AWS::SSM::Parameter'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  KmsKey: {
    category: ResourceCategory.IDENTITY_AND_SECURITY,
    label: 'AWS KMS Customer Managed Keys',
    cfnTypes: ['AWS::KMS::Key'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  IamRole: {
    category: ResourceCategory.IDENTITY_AND_SECURITY,
    label: 'IAM Roles',
    cfnTypes: ['AWS::IAM::Role'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  WafWebAcl: {
    category: ResourceCategory.IDENTITY_AND_SECURITY,
    label: 'AWS WAF Web ACLs',
    cfnTypes: ['AWS::WAFv2::WebACL'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
});
