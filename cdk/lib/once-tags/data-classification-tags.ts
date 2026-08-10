import { DATA_CLASSIFICATION } from './once-tags-const';
import { OnceTags } from './once-tags';

export class DataClassificationTags {
  constructor(private readonly parent: OnceTags) {}

  SENSITIVE(): OnceTags {
    return this.parent.add('DataClassification', DATA_CLASSIFICATION.SENSITIVE);
  }
  OFFICIAL(): OnceTags {
    return this.parent.add('DataClassification', DATA_CLASSIFICATION.OFFICIAL);
  }
  OFFICIAL_SENSITIVE(): OnceTags {
    return this.parent.add(
      'DataClassification',
      DATA_CLASSIFICATION.OFFICIAL_SENSITIVE,
    );
  }
  TOP_SECRET(): OnceTags {
    return this.parent.add(
      'DataClassification',
      DATA_CLASSIFICATION.TOP_SECRET,
    );
  }
}
