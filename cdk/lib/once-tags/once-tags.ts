import { Tags } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';

import { ExposureTags } from './exposure-tags';
import { DataClassificationTags } from './data-classification-tags';
import { PIITags } from './pii-tags';

export class OnceTags {
  private constructor(private readonly scope: IConstruct) {}

  static of(scope: IConstruct): OnceTags {
    return new OnceTags(scope);
  }

  get DataClassification(): DataClassificationTags {
    return new DataClassificationTags(this);
  }

  get Exposure(): ExposureTags {
    return new ExposureTags(this);
  }

  get PII(): PIITags {
    return new PIITags(this);
  }

  /** Internal — applies the tag and returns this for chaining. */
  add(key: string, value: string): OnceTags {
    Tags.of(this.scope).add(key, value);
    return this;
  }
}
