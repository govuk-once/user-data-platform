import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const DATABASE_AND_CACHING_RESOURCE_PROFILES = defineProfiles({
  DynamoDbTable: {
    category: ResourceCategory.DATABASE_AND_CACHING,
    label: 'Amazon DynamoDB Tables',
    cfnTypes: ['AWS::DynamoDB::Table', 'AWS::DynamoDB::GlobalTable'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  RdsCluster: {
    category: ResourceCategory.DATABASE_AND_CACHING,
    label: 'Amazon RDS / Aurora Clusters',
    cfnTypes: ['AWS::RDS::DBCluster', 'AWS::RDS::DBInstance'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  ElastiCacheCluster: {
    category: ResourceCategory.DATABASE_AND_CACHING,
    label: 'Amazon ElastiCache Clusters',
    cfnTypes: [
      'AWS::ElastiCache::CacheCluster',
      'AWS::ElastiCache::ReplicationGroup',
      'AWS::ElastiCache::ServerlessCache',
    ],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  OpenSearchDomain: {
    category: ResourceCategory.DATABASE_AND_CACHING,
    label: 'Amazon OpenSearch Domains',
    cfnTypes: ['AWS::OpenSearchService::Domain', 'AWS::Elasticsearch::Domain'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
});
