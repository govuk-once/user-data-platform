import { ResourceCategory } from './resource-category.const';
import { RESOURCE_CATEGORIES } from './resource-categories';

export interface ResourceProfile {
  readonly category: ResourceCategory;
  readonly label: string;
  readonly cfnTypes: readonly string[];
  readonly piiRequired: boolean;
  readonly dataClassificationRequired: boolean;
  readonly exposureRequired: boolean;
}

export type ResourceProfiles = Record<string, ResourceProfile>;

export type ResourceKey = keyof typeof RESOURCE_CATEGORIES;
