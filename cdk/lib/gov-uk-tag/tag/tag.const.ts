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
 * Pre-configured tag defaults for each Once platform app.
 *
 * These provide sensible starting values for `mandatoryAppTags` and
 * `optionalAppTags`. You'll almost always want to override `Environment`
 * (which defaults to `production` here) and possibly `Component` if your
 * repo deploys a specific sub-service rather than the whole product.
 *
 * @example
 * ```ts
 * GovUKTag.applyAspect(app, {
 *   mandatoryAppTags: {
 *     ...GovUKTag.Once.Suggested.UDP,
 *     Component: 'token-service',
 *     Environment: GovUKTag.Once.mapEnvironment(env),
 *   },
 * });
 * ```
 */
export const OnceSuggestedAppTags: Record<
  'Flex' | 'UDP' | 'UNS',
  GovUKMandatoryAppTags & GovUKOptionalAppTags
> = {
  /**
   * Flex — Identity orchestration service.
   * Manages flexible identity journeys and credential flows.
   */
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
  /**
   * UDP — User Data Platform.
   * Shared data layer storing and managing user identity data
   * across all One Login services.
   */
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
  /**
   * UNS — United Notification Service.
   * Handles outbound notifications (email, SMS, push) for
   * all One Login products.
   */
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
