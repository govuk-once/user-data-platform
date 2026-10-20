import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const ANALYTICS_AND_DATA_LAKES_RESOURCE_PROFILES = defineProfiles({
  KinesisStream: {
    category: ResourceCategory.ANALYTICS_AND_DATA_LAKES,
    label: 'Amazon Kinesis Data Streams',
    cfnTypes: ['AWS::Kinesis::Stream'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  GlueCatalog: {
    category: ResourceCategory.ANALYTICS_AND_DATA_LAKES,
    label: 'AWS Glue Catalog / Crawlers',
    cfnTypes: ['AWS::Glue::Database', 'AWS::Glue::Table', 'AWS::Glue::Crawler'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  AthenaWorkGroup: {
    category: ResourceCategory.ANALYTICS_AND_DATA_LAKES,
    label: 'Amazon Athena Workgroups',
    cfnTypes: ['AWS::Athena::WorkGroup'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
});
