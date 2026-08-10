import { PII } from './once-tags-const';
import { OnceTags } from './once-tags';

export class PIITags {
  constructor(private readonly parent: OnceTags) {}

  TRUE(): OnceTags {
    return this.parent.add('DataClassification', PII.TRUE);
  }
  FALSE(): OnceTags {
    return this.parent.add('DataClassification', PII.FALSE);
  }
  UNKNOWN(): OnceTags {
    return this.parent.add('DataClassification', PII.UNKNOWN);
  }
}
