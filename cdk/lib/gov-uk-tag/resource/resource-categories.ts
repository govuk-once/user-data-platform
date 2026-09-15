import { AI_AND_ML_RESOURCE_PROFILES } from './ai-and-ml.resource-category';
import { ANALYTICS_AND_DATA_LAKES_RESOURCE_PROFILES } from './analytics-and-data-lakes.resource-category';
import { COMPUTE_RESOURCE_PROFILES } from './compute.resource-category';
import { DATABASE_AND_CACHING_RESOURCE_PROFILES } from './database-and-caching.resource-category';
import { IDENTITY_AND_SECURITY_RESOURCE_PROFILES } from './identity-and-security.resource-category';
import { MESSAGING_AND_WORKFLOWS_RESOURCE_PROFILES } from './messaging-and-workflows.resource-category';
import { NETWORKING_AND_API_RESOURCE_PROFILES } from './networking-and-api.resource-category';
import { OBSERVABILITY_AND_AUDIT_RESOURCE_PROFILES } from './observability-and-audit.resource-category';
import { SCHEDULING_AND_CRON_RESOURCE_PROFILES } from './scheduling-and-cron.resource-category';
import { STORAGE_RESOURCE_PROFILES } from './storage.resource-category';

export const RESOURCE_CATEGORIES = {
  ...AI_AND_ML_RESOURCE_PROFILES,
  ...ANALYTICS_AND_DATA_LAKES_RESOURCE_PROFILES,
  ...COMPUTE_RESOURCE_PROFILES,
  ...DATABASE_AND_CACHING_RESOURCE_PROFILES,
  ...IDENTITY_AND_SECURITY_RESOURCE_PROFILES,
  ...MESSAGING_AND_WORKFLOWS_RESOURCE_PROFILES,
  ...NETWORKING_AND_API_RESOURCE_PROFILES,
  ...OBSERVABILITY_AND_AUDIT_RESOURCE_PROFILES,
  ...SCHEDULING_AND_CRON_RESOURCE_PROFILES,
  ...STORAGE_RESOURCE_PROFILES,
};
