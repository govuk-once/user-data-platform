import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const OBSERVABILITY_AND_AUDIT_RESOURCE_PROFILES = defineProfiles({
  LogGroup: {
    category: ResourceCategory.OBSERVABILITY_AND_AUDIT,
    label: 'CloudWatch Log Groups',
    cfnTypes: ['AWS::Logs::LogGroup'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  CloudTrailTrail: {
    category: ResourceCategory.OBSERVABILITY_AND_AUDIT,
    label: 'AWS CloudTrail Trails',
    cfnTypes: ['AWS::CloudTrail::Trail'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  ConfigRule: {
    category: ResourceCategory.OBSERVABILITY_AND_AUDIT,
    label: 'AWS Config Rules',
    cfnTypes: ['AWS::Config::ConfigRule'],
    piiRequired: false,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
});
