import type { ResourceProfiles } from './resource-category.types';

export const defineProfiles = <T extends ResourceProfiles>(profiles: T): T =>
  profiles;
