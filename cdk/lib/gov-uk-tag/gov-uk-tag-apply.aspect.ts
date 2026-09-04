import { IConstruct } from 'constructs';
import { CfnResource, IAspect, TagManager } from 'aws-cdk-lib';

import { APP_TAG_PRIORITY } from './gov-uk-tag.const';
import { GovUKTagAspectBase } from './gov-uk-tag-base.abstract';

/**
 * Applies the GOV.UK One Login app-wide tags to every taggable resource.
 *
 * Mutating pass — add it at `AspectPriority.MUTATING` so it runs before
 * anything that reads tag state back.
 *
 * Scope differs from the validation pass on purpose: app-wide tags go on
 * everything that can hold them, whereas the resource matrix governs only
 * the three compliance tags. A resource type absent from the matrix still
 * gets Product, Owner and the rest.
 *
 * @example
 * ```ts
 * const { mandatory, optional } = GovUKTag.Platform.forApp('UDP', environment);
 * const props = { mandatoryAppTags: mandatory, optionalAppTags: optional };
 *
 * Aspects.of(app).add(new GovUKTagApplyAspect(props), {
 *   priority: AspectPriority.MUTATING,
 * });
 *
 * Aspects.of(app).add(new GovUKTagValidateAspect(props), {
 *   priority: AspectPriority.READONLY,
 * });
 * ```
 */
export class GovUKTagApplyAspect extends GovUKTagAspectBase implements IAspect {
  /**
   * Write the app-wide tags onto a resource's tag manager.
   *
   * Uses `setTag` directly rather than `Tags.of(node).add(...)`: the latter
   * registers a further aspect on a node already being visited, which is
   * unpredictable mid-traversal. `setTag` writes immediately.
   */
  private applyAppTags(tagManager: TagManager): void {
    for (const [key, value] of Object.entries(this.mandatoryAppTags)) {
      tagManager.setTag(key, value, APP_TAG_PRIORITY);
    }

    if (!this.optionalAppTags) return;

    for (const [key, value] of Object.entries(this.optionalAppTags)) {
      if (value === undefined) continue;
      tagManager.setTag(key, value, APP_TAG_PRIORITY);
    }
  }

  /** @param node - Construct being visited. */
  public visit(node: IConstruct): void {
    if (this.disabled) return;

    // Not every construct is a CFN resource; L2s wrap L1s and are visited too.
    if (!CfnResource.isCfnResource(node)) return;

    const tagManager = GovUKTagAspectBase.tagManagerOf(node);
    if (!tagManager) return;

    this.applyAppTags(tagManager);
  }
}
