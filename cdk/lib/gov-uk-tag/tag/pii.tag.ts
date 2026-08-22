import {
  TRUE as _TRUE,
  FALSE as _FALSE,
  UNKNOWN as _UNKNOWN,
} from '../gov-uk-tag.const';
import { GovUKTag } from '../gov-uk-tag.class';

export enum PII_CONTROL_VALUES {
  TRUE = _TRUE,
  FALSE = _FALSE,
  UNKNOWN = _UNKNOWN,
}

export const PII_TAG = 'PII';

/**
 * Declares whether a resource handles Personally Identifiable Information.
 *
 * PII is any data that could identify a living individual — either on its
 * own or when combined with other data you hold. This tag drives data
 * protection compliance (UK GDPR / Data Protection Act 2018) and helps
 * your team understand which resources need extra care around access
 * logging, encryption, retention, and breach notification.
 *
 * **Quick guide:**
 * - {@link TRUE} — The resource stores, processes, or transits data about identifiable people.
 * - {@link FALSE} — The resource never handles data about identifiable people.
 * - {@link UNKNOWN} — You haven't determined yet. Use temporarily, but resolve it before production.
 *
 * **What counts as PII?** Names, email addresses, IP addresses, National
 * Insurance numbers, NHS numbers, dates of birth, biometrics, location data,
 * device IDs that can be linked to a person, pseudonymised data where you
 * hold the key, and anything else that could single out an individual.
 *
 * **What doesn't count?** Aggregated statistics, fully anonymised data
 * (where re-identification is not reasonably possible), infrastructure
 * metrics, application logs with no user identifiers, static assets.
 */
export class PIITag {
  constructor(private readonly parent: GovUKTag) {}

  /**
   * This resource handles data about identifiable individuals.
   *
   * **Examples:** A DynamoDB table storing user profiles, an SQS queue
   * carrying identity verification messages, an S3 bucket holding uploaded
   * identity documents, a Lambda processing user addresses, an RDS database
   * with customer records.
   *
   * **Implications:** The resource needs encryption at rest and in transit,
   * access logging, a defined retention period, and must be included in
   * data breach response plans.
   *
   * @example
   * ```ts
   * GovUKTag.of(userTable).PII.TRUE();
   * ```
   */
  TRUE(): GovUKTag {
    return this.parent.add(PII_TAG, PII_CONTROL_VALUES.TRUE);
  }

  /**
   * This resource does not handle any data about identifiable individuals.
   *
   * **Examples:** An S3 bucket serving static frontend assets, a Lambda
   * that transforms configuration data, a CloudWatch log group for
   * infrastructure metrics (with no user IDs in log lines), a DynamoDB
   * table storing feature flags.
   *
   * **Be careful:** Even access logs can contain PII (IP addresses, user
   * agent strings combined with timestamps). If in doubt, check what
   * actually flows through the resource, not just what you intend.
   *
   * @example
   * ```ts
   * GovUKTag.of(configBucket).PII.FALSE();
   * ```
   */
  FALSE(): GovUKTag {
    return this.parent.add(PII_TAG, PII_CONTROL_VALUES.FALSE);
  }

  /**
   * You haven't yet determined whether this resource handles PII.
   *
   * **Use this temporarily** during development or when inheriting an
   * existing resource whose data flows you haven't fully mapped. This is
   * an honest "I don't know yet", not a permanent state.
   *
   * **You must resolve this before production.** UNKNOWN resources will
   * be flagged in compliance reviews and may block release sign-off.
   * Investigate the data flowing through the resource and switch to
   * {@link TRUE} or {@link FALSE}.
   *
   * @example
   * ```ts
   * GovUKTag.of(legacyQueue).PII.UNKNOWN();
   * ```
   */
  UNKNOWN(): GovUKTag {
    return this.parent.add(PII_TAG, PII_CONTROL_VALUES.UNKNOWN);
  }
}
