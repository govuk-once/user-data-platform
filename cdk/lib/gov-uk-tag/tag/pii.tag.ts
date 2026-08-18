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

/** Describes whether the resource holds personal identifiable data. */
export class PIITag {
  constructor(private readonly parent: GovUKTag) {}

  /** PII true
   *
   * @notes DynamoDB, RDS, Queue
   * @example todo example
   */
  TRUE(): GovUKTag {
    return this.parent.add(PII_TAG, PII_CONTROL_VALUES.TRUE);
  }

  /** PII false
   *
   * @notes DynamoDB, RDS, Queue
   * @example todo example
   */
  FALSE(): GovUKTag {
    return this.parent.add(PII_TAG, PII_CONTROL_VALUES.FALSE);
  }

  /** PII unknown
   *
   * @notes DynamoDB, RDS, Queue
   * @example todo example
   */
  UNKNOWN(): GovUKTag {
    return this.parent.add(PII_TAG, PII_CONTROL_VALUES.UNKNOWN);
  }
}
