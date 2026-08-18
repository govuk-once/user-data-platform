import { IConstruct } from 'constructs';
import { CfnResource, IAspect, Annotations } from 'aws-cdk-lib';

import { GovUKTagAspectBase } from './gov-uk-tag-base.abstract';
import { RESOURCE_CATEGORIES } from './resource/resource-categories';
import { Tag } from './tag/tag.const';

import type { Tag as TagType } from './tag/tag.types';
import type { ResourceKey } from './resource/resource-category.types';

/**
 * Reports resources missing the compliance tags their type requires.
 *
 * Read-only pass — add it at `AspectPriority.READONLY` so it runs after
 * {@link GovUKTagApplyAspect} and after any `Tags.of()` calls made through
 * the `GovUKTag` helper chain. Without an explicit priority it can run
 * first and report missing tags on a compliant stack.
 *
 * Findings are raised through `Annotations.addError` rather than thrown:
 * the traversal continues, so one synth surfaces every violation with its
 * construct path instead of only the first.
 */
export class GovUKTagValidateAspect
  extends GovUKTagAspectBase
  implements IAspect
{
  /**
   * Resolve which compliance tags a given profile requires.
   *
   * Each requirement is read from the profile independently rather than
   * derived from broader capability flags, because the matrix does not
   * follow a single rule in either direction: EBS volumes handle data but
   * are not network exposed, WAF Web ACLs are exposed but hold no data.
   *
   * @param key - Profile key resolved from the resource's CFN type.
   * @returns The tags this resource type must carry, possibly empty.
   */
  private requiredTagsForResource(key: ResourceKey): TagType[] {
    const profile = RESOURCE_CATEGORIES[key];

    const tags: TagType[] = [];

    if (profile.piiRequired) tags.push(Tag.PII);
    if (profile.dataClassificationRequired) tags.push(Tag.DATA_CLASSIFICATION);
    if (profile.exposureRequired) tags.push(Tag.EXPOSURE);

    return tags;
  }

  /**
   * Inspect one construct and record any missing required tags.
   *
   * Called for every node in the tree, so the early returns carry most of
   * the logic. Anything that is not a taggable CFN resource, or whose type
   * is absent from the matrix, is skipped silently — a synthesised tree is
   * full of L2 constructs, metadata and resource types the standard says
   * nothing about, and erroring on those would drown the real findings.
   *
   * @param node - Construct being visited.
   *
   * @remarks
   * Skipping unknown CFN types means a newly adopted AWS service enters the
   * estate untagged and unreported until someone adds it to the matrix. A
   * strict mode that fails on unrecognised taggable types, run in CI only,
   * would close that gap.
   */
  public visit(node: IConstruct): void {
    if (this.disabled) return;

    if (!CfnResource.isCfnResource(node)) return;

    const tagManager = GovUKTagAspectBase.tagManagerOf(node);
    if (!tagManager) return;

    const key = GovUKTagAspectBase.cfnTypeToResource.get(node.cfnResourceType);
    if (!key) return;

    const profile = RESOURCE_CATEGORIES[key];
    const present = tagManager.tagValues();

    const missing = this.requiredTagsForResource(key).filter(
      (tag) => !present[tag],
    );

    if (missing.length) {
      const location = GovUKTagAspectBase.sourceLocation(node);

      Annotations.of(node).addError(
        `\nMissing required tags for ${profile.label} (${node.cfnResourceType}):\n` +
          `${missing.join('\n')}` +
          (location ? `\n  created at ${location}\n` : '\n'),
      );
    }
  }
}
