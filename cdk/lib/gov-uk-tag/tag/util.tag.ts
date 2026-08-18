import { TRUE as _TRUE } from '../gov-uk-tag.const';
import { GovUKTag } from '../gov-uk-tag.class';

/** Util */
export enum RETAIN_CONTROL_VALUES {
  TRUE = _TRUE,
}

export const RETAIN_TAG = 'retain';

export class UtilTag {
  constructor(private readonly parent: GovUKTag) {}

  RETAIN(): GovUKTag {
    return this.parent.add(RETAIN_TAG, RETAIN_CONTROL_VALUES.TRUE);
  }
}
