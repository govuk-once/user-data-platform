import { GovUKTag } from '../gov-uk-tag.class';

export const DATA_CLASSIFICATION_TAG = 'DataClassification';

export enum DATA_CLASSIFICATION_CONTROL_VALUES {
  OFFICIAL = 'OFFICIAL',
  OFFICIAL_SENSITIVE = 'OFFICIAL_SENSITIVE',
  SENSITIVE = 'SENSITIVE',
  TOP_SECRET = 'TOP_SECRET',
}

/** Describes the sensitivity of data handled by the resource. */
export class DataClassificationTag {
  constructor(private readonly parent: GovUKTag) {}

  /** Sensitive
   *
   * @example TODO provide example
   */
  SENSITIVE(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.SENSITIVE,
    );
  }

  /** Official
   *
   * @note must trigger a review
   * @example TODO provide example
   */
  OFFICIAL(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.OFFICIAL,
    );
  }

  /** Official Sensitive
   *
   * @example TODO provide example
   */
  OFFICIAL_SENSITIVE(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.OFFICIAL_SENSITIVE,
    );
  }

  /** Top Secret
   *
   * @example TODO provide example
   */
  TOP_SECRET(): GovUKTag {
    return this.parent.add(
      DATA_CLASSIFICATION_TAG,
      DATA_CLASSIFICATION_CONTROL_VALUES.TOP_SECRET,
    );
  }
}
