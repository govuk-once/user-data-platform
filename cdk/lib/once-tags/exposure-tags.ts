import { EXPOSURE } from './once-tags-const';
import { OnceTags } from './once-tags';

export class ExposureTags {
  constructor(private readonly parent: OnceTags) {}

  INTERNAL(): OnceTags {
    return this.parent.add('once:exposure', EXPOSURE.INTERNAL);
  }

  INTERNET_FACING(): OnceTags {
    return this.parent.add('once:exposure', EXPOSURE.INTERNET_FACING);
  }

  PERIMETER(): OnceTags {
    return this.parent.add('once:exposure', EXPOSURE.PERIMETER);
  }

  ISOLATED(): OnceTags {
    return this.parent.add('once:exposure', EXPOSURE.ISOLATED);
  }
}
