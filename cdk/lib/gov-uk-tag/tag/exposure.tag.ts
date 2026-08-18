import { GovUKTag } from '../gov-uk-tag.class';

export enum EXPOSURE_CONTROL_VALUES {
  INTERNAL = 'internal',
  INTERNET_FACING = 'internet_facing',
  ISOLATED = 'isolated',
  PERIMETER = 'perimeter',
}

export const EXPOSURE_TAG = 'Exposure';

/** Describes whether the resource is public, private, internal, or otherwise exposed. */
export class ExposureTag {
  constructor(private readonly parent: GovUKTag) {}

  /** Internal
   *
   * @notes Private Subnets, Transit Gateway, VPN
   * @example todo example
   */
  INTERNAL(): GovUKTag {
    return this.parent.add(EXPOSURE_TAG, EXPOSURE_CONTROL_VALUES.INTERNAL);
  }

  /** Internet facing
   *
   * @notes Public EC2, Public ALBs, CloudFront
   * @example todo example
   */
  INTERNET_FACING(): GovUKTag {
    return this.parent.add(
      EXPOSURE_TAG,
      EXPOSURE_CONTROL_VALUES.INTERNET_FACING,
    );
  }

  /** Perimeter
   *
   * @notes WAF, Bastion Hosts, Proxy Appliances
   * @example todo example
   */
  PERIMETER(): GovUKTag {
    return this.parent.add(EXPOSURE_TAG, EXPOSURE_CONTROL_VALUES.PERIMETER);
  }

  /** Isolated
   *
   * @notes Isolated Subnets, VPC Endpoints
   * @example todo example
   */
  ISOLATED(): GovUKTag {
    return this.parent.add(EXPOSURE_TAG, EXPOSURE_CONTROL_VALUES.ISOLATED);
  }
}
