import { IConstruct } from 'constructs';
import { CfnResource, TagManager } from 'aws-cdk-lib';

import {
  MIN_TAG_VALUE_LENGTH,
  INVALID_TAG_VALUES,
  GOV_UK_MANDATORY_APP_TAG_KEYS,
} from './gov-uk-tag.const';
import { RESOURCE_CATEGORIES } from './resource/resource-categories';

import type {
  GovUKTagAspectProps,
  GovUKMandatoryAppTags,
  GovUKOptionalAppTags,
} from './gov-uk-tag.types';
import type { ResourceKey } from './resource/resource-category.types';

/**
 * Shared state and lookups for the GOV.UK One Login tagging aspects.
 *
 * The standard needs two passes over the tree that cannot be one aspect:
 * {@link GovUKTagApplyAspect} writes the app-wide tags and must run early,
 * while {@link GovUKTagValidateAspect} reads back the resource-level
 * compliance tags and must run after everything that writes them —
 * including the `Tags.of()` calls behind the `GovUKTag` helper chain.
 * Collapsing them into a single aspect means reading tag state mid-write,
 * which produces missing-tag errors on compliant stacks.
 *
 * Both halves take the same props and share the same validation, so that
 * lives here.
 */
export abstract class GovUKTagAspectBase {
  /** App-wide tags every resource is expected to carry. Validated on construction. */
  protected readonly mandatoryAppTags: GovUKMandatoryAppTags;

  /** App-wide tags applied when supplied. Absent is fine; present-but-junk is not. */
  protected readonly optionalAppTags: GovUKOptionalAppTags | undefined;

  /** When true, `visit` is a no-op and constructor validation is skipped. */
  protected readonly disabled: boolean;

  /**
   * Reverse index from CloudFormation resource type to profile key, e.g.
   * `AWS::Lambda::Function` to `LambdaFunction`.
   *
   * The matrix is keyed by profile name but resources arrive at `visit`
   * identified only by their CFN type, so the lookup has to run the other
   * way. Profiles may claim several types (ECS covers both `TaskDefinition`
   * and `Service`), hence the flatMap.
   *
   * Static because it derives entirely from module-level data — building it
   * per instance is wasted work, and the shared initialiser gives one place
   * to catch two profiles claiming the same type.
   *
   * @throws Error at import time if a CFN type appears in more than one
   * profile, which would otherwise make lookups depend on spread order in
   * the `RESOURCE_CATEGORIES` barrel.
   */
  protected static readonly cfnTypeToResource: ReadonlyMap<
    string,
    ResourceKey
  > = (() => {
    const index = new Map<string, ResourceKey>();

    for (const [key, profile] of Object.entries(RESOURCE_CATEGORIES)) {
      for (const cfnType of profile.cfnTypes) {
        const existing = index.get(cfnType);

        if (existing) {
          throw new Error(
            `Duplicate cfnType '${cfnType}' claimed by '${existing}' and '${key}'`,
          );
        }

        index.set(cfnType, key as ResourceKey);
      }
    }

    return index;
  })();

  /**
   * @param props - App tag values and behaviour flags.
   * @throws Error if any supplied tag value is empty, padded, too short, or
   * a recognised placeholder. Validation is skipped entirely when disabled.
   */
  constructor(protected readonly props: GovUKTagAspectProps) {
    this.disabled = props.disabled ?? false;
    this.mandatoryAppTags = props.mandatoryAppTags;
    this.optionalAppTags = props.optionalAppTags;

    if (this.disabled) return;

    this.validateMandatoryAppTags();
    this.validateOptionalAppTags();
  }

  /**
   * Resolve a resource's tag manager across both taggable interfaces.
   *
   * Older L1s expose `tags` (ITaggable); newer generated ones expose
   * `cdkTagManager` (ITaggableV2). Several resources in the matrix —
   * OpenSearch among them — are in the second group, so checking only
   * `isTaggable` silently skips them.
   *
   * @returns The manager, or `undefined` for resource types that cannot
   * carry tags in CloudFormation at all (`AWS::Config::ConfigRule` among
   * them).
   */
  protected static tagManagerOf(node: CfnResource): TagManager | undefined {
    if (TagManager.isTaggable(node)) return node.tags;
    if (TagManager.isTaggableV2(node)) return node.cdkTagManager;

    return undefined;
  }

  /**
   * Assert that a single tag value carries real information.
   *
   * A required-field check alone is not enough for a compliance tag: `'N/A'`,
   * `'TBC'` and `'unknown'` all satisfy "is present" while telling a cost or
   * data-protection report precisely nothing. This rejects those alongside
   * the structural problems.
   *
   * Whitespace is rejected rather than trimmed, because AWS treats `'udp '`
   * and `'udp'` as different tag values — silently trimming here would hide
   * a mismatch that only surfaces when someone filters on the tag.
   *
   * @param field - Tag name, used in the error message.
   * @param value - Candidate tag value.
   * @throws Error describing which check failed and on which field.
   */
  protected validateTagValue(field: string, value: string): void {
    // Runtime guard, not redundant with the types: props can arrive from
    // JSON config or a JS consumer where the compile-time contract is absent.
    if (typeof value !== 'string') {
      throw new Error(
        `Tag '${field}' must be a string, received ${typeof value}`,
      );
    }

    const trimmed = value.trim();

    if (trimmed === '') {
      throw new Error(`Tag '${field}' is empty`);
    }

    if (trimmed !== value) {
      throw new Error(
        `Tag '${field}' has leading or trailing whitespace: '${value}'`,
      );
    }

    if (trimmed.length < MIN_TAG_VALUE_LENGTH) {
      throw new Error(
        `Tag '${field}' is too short to be meaningful: '${value}'`,
      );
    }

    // Normalise separators so 'n a', 'n_a' and 'n-a' collapse to one entry
    // in the deny list. Both forms are checked because the list holds some
    // values that contain no separators at all.
    const normalised = trimmed.toLowerCase().replace(/[\s_]+/g, '-');

    if (
      INVALID_TAG_VALUES.has(normalised) ||
      INVALID_TAG_VALUES.has(trimmed.toLowerCase())
    ) {
      throw new Error(`Tag '${field}' is a placeholder value: '${value}'`);
    }
  }

  /**
   * Assert that every mandatory app tag is present and meaningful.
   *
   * Presence is checked separately from value because `Object.entries` only
   * reports keys that exist — a field missing entirely produces no entry to
   * validate and would otherwise pass silently.
   *
   * `Environment` needs no value check here: it is typed as
   * `GovUkOnceFullEnvironments`, and `mapEnvironment` throws on unrecognised
   * input before this point.
   *
   * @throws Error on the first missing or invalid mandatory tag.
   */
  protected validateMandatoryAppTags(): void {
    const entries = Object.entries(this.mandatoryAppTags) as [
      keyof GovUKMandatoryAppTags,
      string,
    ][];

    for (const field of GOV_UK_MANDATORY_APP_TAG_KEYS) {
      if (!(field in this.mandatoryAppTags)) {
        throw new Error(`Mandatory tag '${field}' is missing`);
      }
    }

    for (const [field, value] of entries) {
      this.validateTagValue(field, value);
    }
  }

  /**
   * Assert that any optional app tags supplied are meaningful.
   *
   * Omitting an optional tag is fine. Supplying `'N/A'` for it is not —
   * that is a claim about the resource, and a false one.
   *
   * @throws Error if a supplied optional tag is invalid, or if
   * `RepositoryUrl` is not a GitHub repository URL.
   */
  protected validateOptionalAppTags(): void {
    if (!this.optionalAppTags) return;

    for (const [field, value] of Object.entries(this.optionalAppTags)) {
      if (value === undefined) continue; // absent is fine; junk is not
      this.validateTagValue(field, value);
    }

    const { RepositoryUrl } = this.optionalAppTags;

    // Shape check rather than reachability: catches a bare repo name or the
    // wrong org, which is the common paste error.
    if (
      RepositoryUrl !== undefined &&
      !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(RepositoryUrl)
    ) {
      throw new Error(
        `Tag 'RepositoryUrl' is not a GitHub repository URL: '${RepositoryUrl}'`,
      );
    }
  }

  /**
   * Best-effort source location for a construct, from its creation stack trace.
   *
   * Only available when stack traces are enabled (`CDK_DEBUG=true`), so this
   * returns undefined on a normal synth and the message falls back to the
   * construct path alone.
   */
  public static sourceLocation(node: IConstruct): string | undefined {
    for (const entry of node.node.metadata) {
      if (!entry.trace) continue;

      const frame = entry.trace.find(
        (f) => !f.includes('node_modules') && !f.includes('aws-cdk-lib'),
      );

      if (frame) return frame.trim();
    }

    return undefined;
  }
}
