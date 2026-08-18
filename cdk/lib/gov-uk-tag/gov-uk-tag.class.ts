import { IConstruct } from 'constructs';
import { Tags, Aspects, AspectPriority } from 'aws-cdk-lib';

import {
  ExposureTag,
  DataClassificationTag,
  PIITag,
  UtilTag,
  OnceTag,
} from './tag';
import { GovUKTagApplyAspect } from './gov-uk-tag-apply.aspect';
import { GovUKTagValidateAspect } from './gov-uk-tag-validate.aspect';

import type { GovUKTagAspectProps } from './gov-uk-tag.types';

export class GovUKTag {
  private constructor(private readonly scope: IConstruct) {}

  static of(scope: IConstruct): GovUKTag {
    return new GovUKTag(scope);
  }

  /** Describes the sensitivity of data handled by the resource. */
  get DataClassification(): DataClassificationTag {
    return new DataClassificationTag(this);
  }

  /** Describes whether the resource is public, private, internal, or otherwise exposed. */
  get Exposure(): ExposureTag {
    return new ExposureTag(this);
  }

  /** Describes whether the resource holds personal identifiable data. */
  get PII(): PIITag {
    return new PIITag(this);
  }

  /** Util TODO add comment */
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

  /** Internal — applies the tag and returns this for chaining. */
  add(key: string, value: string): GovUKTag {
    Tags.of(this.scope).add(key, value);
    return this;
  }
}
