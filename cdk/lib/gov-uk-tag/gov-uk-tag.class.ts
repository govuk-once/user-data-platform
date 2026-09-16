import { Stack, Tags, Aspects, AspectPriority } from 'aws-cdk-lib';
import { IRole } from 'aws-cdk-lib/aws-iam';

import {
  ExposureTag,
  DataClassificationTag,
  PIITag,
  UtilTag,
  OnceTag,
} from './tag';
import { GovUKTagApplyAspect } from './gov-uk-tag-apply.aspect';
import { GovUKTagValidateAspect } from './gov-uk-tag-validate.aspect';

import type { IConstruct } from 'constructs';
import type { GovUKTagAspectProps } from './gov-uk-tag.types';
// extra custom tags
export class GovUKTag {
  private constructor(private readonly scope: IConstruct) {}

  static of(scope: IConstruct | IRole): GovUKTag {
    return new GovUKTag(scope);
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
  get DataClassification(): DataClassificationTag {
    return new DataClassificationTag(this);
  }

  /**
   * Describes the network exposure of a resource — where it sits relative
   * to the internet and internal networks.
   *
   * This helps security and compliance teams understand the blast radius
   * if a resource is misconfigured or compromised.
   *
   * **Quick guide:**
   * - {@link INTERNAL} — Only reachable from within your VPC / private network.
   * - {@link INTERNET_FACING} — Directly reachable from the public internet.
   * - {@link PERIMETER} — Sits at the boundary, inspecting or filtering traffic (WAF, proxy).
   * - {@link ISOLATED} — No network connectivity at all, or only via VPC endpoints.
   */
  get Exposure(): ExposureTag {
    return new ExposureTag(this);
  }

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
  get PII(): PIITag {
    return new PIITag(this);
  }

  /**
   * Utility tags for operational behaviour hints.
   *
   * These don't affect compliance — they signal intent to infrastructure
   * tooling (backup policies, cleanup scripts, cost allocation).
   */
  get Util(): UtilTag {
    return new UtilTag(this);
  }

  /** Core Once tag suggestions and util. */
  static get Once(): OnceTag {
    return new OnceTag(this);
  }

  /**
   * Register the GOV.UK tagging aspects on an app or stack.
   *
   * Two passes at different priorities: the apply pass writes the app-wide
   * tags, the validate pass reads back the resource-level compliance tags.
   * Both must be registered, and in this order of priority — a validate pass
   * that runs before tags are written reports missing tags on a compliant
   * stack.
   *
   * @param scope - App or stack to tag. Everything beneath it is visited.
   * @param props - App tag values and behaviour flags.
   * @throws Error if any supplied tag value is empty, padded, too short, or
   * a recognised placeholder.
   */
  static applyAspect(scope: IConstruct, props: GovUKTagAspectProps): void {
    if (props.disabled) return;

    Aspects.of(scope).add(new GovUKTagApplyAspect(props), {
      priority: AspectPriority.MUTATING, // 200
    });

    Aspects.of(scope).add(new GovUKTagValidateAspect(props), {
      priority: AspectPriority.READONLY, // 1000, runs after MUTATING
    });
  }

  /**
   * Tag a construct that has no handle in scope, by path suffix.
   *
   * Only needed for resources CDK creates internally — notification handlers,
   * custom resource providers, log retention singletons. For anything you
   * construct yourself, `GovUKTag.of(parent)` already propagates to every
   * child and is preferable: it survives renames and CDK version bumps,
   * whereas a path string does not.
   *
   * @param root - Construct to search beneath, usually `Stack.of(this)`.
   * @param path - Trailing portion of the construct path, e.g.
   * `'BucketNotificationsHandler'` or `'ConfigurationRole/Resource'`.
   * @throws Error if the suffix matches no construct, or more than one — a
   * silent miss would leave a compliance tag unapplied while appearing to work.
   */
  static buriedOf(scope: IConstruct, path: string): GovUKTag {
    const root = Stack.of(scope);
    const found = root.node
      .findAll()
      .filter((construct) => construct.node.path.includes(path));

    // Descendants of another match are covered by tagging their ancestor —
    // Tags.of() propagates down the subtree — so keep only the roots.
    const matches = found.filter(
      (candidate) =>
        !found.some(
          (other) =>
            other !== candidate &&
            candidate.node.path.startsWith(`${other.node.path}/`),
        ),
    );

    if (matches.length === 0) {
      throw new Error(
        `No construct in stack '${root.stackName}' matches '${path}'`,
      );
    }

    if (matches.length > 1) {
      throw new Error(
        `Ambiguous path '${path}' in stack '${root.stackName}': ` +
          matches.map((c) => c.node.path).join(', '),
      );
    }

    return GovUKTag.of(matches[0]);
  }

  /** Internal — applies the tag and returns this for chaining. */
  add(key: string, value: string): GovUKTag {
    Tags.of(this.scope).add(key, value);
    return this;
  }
}
