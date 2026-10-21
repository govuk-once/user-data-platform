import { ResourceCategory } from './resource-category.const';
import { defineProfiles } from './resource-category.util';

export const STORAGE_RESOURCE_PROFILES = defineProfiles({
  S3Bucket: {
    category: ResourceCategory.STORAGE,
    label: 'Amazon S3 Buckets',
    cfnTypes: ['AWS::S3::Bucket'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
  EbsVolume: {
    category: ResourceCategory.STORAGE,
    label: 'Amazon EBS Volumes',
    cfnTypes: ['AWS::EC2::Volume'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: false,
  },
  EfsFileSystem: {
    category: ResourceCategory.STORAGE,
    label: 'Amazon EFS File Systems',
    cfnTypes: ['AWS::EFS::FileSystem'],
    piiRequired: true,
    dataClassificationRequired: true,
    exposureRequired: true,
  },
});
