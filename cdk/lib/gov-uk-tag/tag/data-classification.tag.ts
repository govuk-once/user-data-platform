import { GovUKTag } from '../gov-uk-tag.class';

export const DATA_CLASSIFICATION_TAG = 'DataClassification';

export enum DATA_CLASSIFICATION_CONTROL_VALUES {
  OFFICIAL = 'OFFICIAL',
  OFFICIAL_SENSITIVE = 'OFFICIAL_SENSITIVE',
  SENSITIVE = 'SENSITIVE',
  TOP_SECRET = 'TOP_SECRET',
}

/**
 * Describes the sensitivity of data handled or stored by a resource.
 *
 * Use this to declare what level of government security classification
 * applies to the data flowing through your resource. If you're unsure,
 * start with {@link OFFICIAL} — the vast majority of government work
 * lives there.
 *
 * **Quick guide:**
 * - {@link OFFICIAL} — Most day-to-day government data. Default for nearly everything.
 * - {@link OFFICIAL_SENSITIVE} — Still OFFICIAL, but not for public eyes (e.g. policy drafts, internal reports).
 * - {@link SENSITIVE} — Rarely used directly; shorthand for SECRET-tier data that could endanger lives or national security.
 * - {@link TOP_SECRET} — Exceptionally sensitive national security information. You'll know if this applies.
 *
 * @see {@link https://www.gov.uk/government/publications/government-security-classifications/government-security-classifications-policy-html Government Security Classifications Policy}
 */
export class DataClassificationTag {
  constructor(private readonly parent: GovUKTag) {}

  /**
   * Most government information. Use this unless you have a specific reason not to.
   *
   * Covers the bulk of everyday government work: internal tooling, service
   * configuration, application logs, non-personal operational data, public
   * service infrastructure.
   *
   * Compromise would cause limited or moderate damage — think reputational
   * embarrassment or minor operational disruption, not front-page news.
   *
   * **Examples:** API Gateway serving a public service, a Lambda processing
   * non-sensitive form submissions, an S3 bucket holding static assets.
   *
   * @example
   * ```ts
   * GovUKTag.of(myBucket).DataClassification.OFFICIAL();
   * ```
   *
   * @see {@link https://www.gov.uk/government/publications/government-security-classifications/government-security-classifications-policy-html#definitions-for-official-secret-and-top-secret Government Security Classifications Policy - Definitions}
   */
  OFFICIAL(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.OFFICIAL,
    );
  }

  /**
   * OFFICIAL data that isn't meant for public release and could cause moderate
   * damage if disclosed to the wrong people.
   *
   * This is NOT a separate tier — it's OFFICIAL with a handling caveat. Use it
   * when your resource holds data that would interest threat actors, activists,
   * or the media, but doesn't meet the threshold for SECRET.
   *
   * **Examples:** A DynamoDB table storing user identity claims, an SQS queue
   * carrying internal policy decisions before announcement, a Lambda processing
   * fraud signals, a database holding staff records.
   *
   * **When in doubt:** If the data is about real people or unpublished policy,
   * lean toward OFFICIAL_SENSITIVE.
   *
   * @example
   * ```ts
   * GovUKTag.of(userTable).DataClassification.OFFICIAL_SENSITIVE();
   * ```
   *
   * @see {@link https://www.gov.uk/government/publications/government-security-classifications/government-security-classifications-policy-html#additional-markings Government Security Classifications Policy - Additional Markings}
   */
  OFFICIAL_SENSITIVE(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.OFFICIAL_SENSITIVE,
    );
  }

  /**
   * Very sensitive data where compromise could threaten lives, seriously damage
   * UK security or international relations, or impede serious crime investigation.
   *
   * Requires Security Check (SC) clearance for anyone with access. If your
   * service handles this tier, your team and architecture will already have
   * gone through formal accreditation — this won't be a surprise.
   *
   * **Examples:** Intelligence-derived data, diplomatic communications,
   * counter-terrorism operational data, critical national infrastructure controls.
   *
   * **Note:** If you're unsure whether your data reaches this threshold,
   * it almost certainly doesn't. Speak to your security team before applying.
   *
   * @example
   * ```ts
   * GovUKTag.of(secureBucket).DataClassification.SENSITIVE();
   * ```
   *
   * @see {@link https://www.gov.uk/government/publications/government-security-classifications/government-security-classifications-policy-html#definitions-for-official-secret-and-top-secret Government Security Classifications Policy - Definitions}
   */
  SENSITIVE(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.SENSITIVE,
    );
  }

  /**
   * Exceptionally sensitive national security information. Compromise could
   * cause widespread loss of life, grave damage to military capability, or
   * directly threaten national stability.
   *
   * Requires Developed Vetting (DV) clearance. Resources at this level live
   * in dedicated, air-gapped or heavily isolated environments with strict
   * physical and personnel controls.
   *
   * **If you're reading this in a normal CDK project, this almost certainly
   * does not apply to you.** TOP SECRET workloads have bespoke infrastructure
   * and will never share an AWS account with regular services.
   *
   * @example
   * ```ts
   * GovUKTag.of(isolatedResource).DataClassification.TOP_SECRET();
   * ```
   *
   * @see {@link https://www.gov.uk/government/publications/government-security-classifications/government-security-classifications-policy-html#definitions-for-official-secret-and-top-secret Government Security Classifications Policy - Definitions}
   */
  TOP_SECRET(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.TOP_SECRET,
    );
  }
}
