import type { GovUKMandatoryAppTags } from './gov-uk-tag.types';

/*
 * Environment Config
 */
export enum GovUKEnvironments {
  SANDBOX = 'sandbox',
  BUILD = 'build',
  DEVELOPMENT = 'development',
  INTEGRATION = 'integration',
  STAGING = 'staging',
  PRODUCTION = 'production',
}

/**
 * Generic Control Values
 */
export const TRUE = 'true';
export const FALSE = 'false';
export const UNKNOWN = 'unknown';

/**
 * Tag Aspect Config
 */
export const APP_TAG_PRIORITY = 50; // Applied below the CDK default so construct-level overrides win.
export const MIN_TAG_VALUE_LENGTH = 2;
export const INVALID_TAG_VALUES: ReadonlySet<string> = new Set([
  'n/a',
  'na',
  'n\\a',
  'none',
  'null',
  'nil',
  'undefined',
  'unknown',
  'tbc',
  'tbd',
  'todo',
  'test',
  'temp',
  'default',
  'placeholder',
  'example',
  'foo',
  'bar',
  'xxx',
  '-',
  '--',
  '.',
  '?',
  'string',
  'changeme',
  'your-team',
  'my-service',
]);

export const MandatoryAppTag = {
  PRODUCT: 'Product',
  SERVICE: 'Service',
  COMPONENT: 'Component',
  ENVIRONMENT: 'Environment',
  OWNER: 'Owner',
  SOURCE: 'Source',
} as const satisfies Record<string, keyof GovUKMandatoryAppTags>;

export type MandatoryAppTag =
  (typeof MandatoryAppTag)[keyof typeof MandatoryAppTag];

export const GOV_UK_MANDATORY_APP_TAG_KEYS = Object.values(MandatoryAppTag);
