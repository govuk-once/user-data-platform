import { TRUE as _TRUE } from '../gov-uk-tag.const';
import { GovUKTag } from '../gov-uk-tag.class';

export enum RETAIN_CONTROL_VALUES {
  TRUE = _TRUE,
}

export const RETAIN_TAG = 'retain';

/**
 * Utility tags for operational behaviour hints.
 *
 * These don't affect compliance — they signal intent to infrastructure
 * tooling (backup policies, cleanup scripts, cost allocation).
 */
export class UtilTag {
  constructor(private readonly parent: GovUKTag) {}

  /**
   * Marks a resource as "do not delete" — it should survive stack teardowns,
   * cleanup scripts, and environment recycling.
   *
   * Use this for resources that hold state you can't recreate: databases with
   * production data, S3 buckets with audit logs under a retention policy,
   * KMS keys that encrypt data you still need to read.
   *
   * **This is a signal to tooling, not a CDK removal policy.** If you also
   * need CDK to skip deletion on `cdk destroy`, set `removalPolicy: RETAIN`
   * on the construct separately. This tag tells external automation (cleanup
   * lambdas, account-wiping scripts) to leave the resource alone.
   *
   * @example
   * ```ts
   * GovUKTag.of(auditBucket).Util.RETAIN();
   * ```
   */
  RETAIN(): GovUKTag {
    return this.parent.add(RETAIN_TAG, RETAIN_CONTROL_VALUES.TRUE);
  }
}
