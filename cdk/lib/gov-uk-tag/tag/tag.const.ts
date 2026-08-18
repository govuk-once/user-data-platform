import { GovUKEnvironments } from '../gov-uk-tag.const';
import { DATA_CLASSIFICATION_TAG } from './data-classification.tag';
import { PII_TAG } from './pii.tag';
import { EXPOSURE_TAG } from './exposure.tag';

import type {
  GovUKMandatoryAppTags,
  GovUKOptionalAppTags,
} from '../gov-uk-tag.types';

export enum OnceEnvironments {
  Dev = 'dev',
  Stag = 'stag',
  Prod = 'prod',
}

export enum GovUKOnceEnvironmentToFullMap {
  Dev = 'DEVELOPMENT',
  Stag = 'STAGING',
  Prod = 'PRODUCTION',
}

export const SHORT_TO_FULL: Record<OnceEnvironments, GovUKEnvironments> = {
  [OnceEnvironments.Dev]: GovUKEnvironments.DEVELOPMENT,
  [OnceEnvironments.Stag]: GovUKEnvironments.STAGING,
  [OnceEnvironments.Prod]: GovUKEnvironments.PRODUCTION,
};

export const FULL_ENVIRONMENTS = new Set<string>(
  Object.values(GovUKEnvironments),
);

export const Tag = {
  PII: PII_TAG,
  DATA_CLASSIFICATION: DATA_CLASSIFICATION_TAG,
  EXPOSURE: EXPOSURE_TAG,
};

/**
 * Once mandatory and pptional tag defaults
 */
export const OnceSuggestedAppTags: Record<
  'Flex' | 'UDP' | 'UNS',
  GovUKMandatoryAppTags & GovUKOptionalAppTags
> = {
  /** Flex */
  Flex: {
    Product: 'flex',
    Service: 'flex',
    Component: 'flex',
    Environment: GovUKEnvironments.PRODUCTION,
    Owner: 'flex',
    Source: 'flex',
    RepositoryUrl: 'https://github.com/govuk-once/flex',
    BillingProject: 'flex',
  },
  /** User Data Platform */
  UDP: {
    Product: 'udp',
    Service: 'udp',
    Component: 'user-data-platform',
    Environment: GovUKEnvironments.PRODUCTION,
    Owner: 'udp',
    Source: 'udp',
    RepositoryUrl: 'https://github.com/govuk-once/user-data-platform',
    BillingProject: 'udp',
  },
  /** United Notification Service */
  UNS: {
    Product: 'uns',
    Service: 'uns',
    Component: 'uns',
    Environment: GovUKEnvironments.PRODUCTION,
    Owner: 'uns',
    Source: 'uns',
    RepositoryUrl: 'https://github.com/govuk-once/uns',
    BillingProject: 'uns',
  },
};
