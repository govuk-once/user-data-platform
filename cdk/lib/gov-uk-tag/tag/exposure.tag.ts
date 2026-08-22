import { GovUKTag } from '../gov-uk-tag.class';

export enum EXPOSURE_CONTROL_VALUES {
  INTERNAL = 'internal',
  INTERNET_FACING = 'internet_facing',
  ISOLATED = 'isolated',
  PERIMETER = 'perimeter',
}

export const EXPOSURE_TAG = 'Exposure';

/**
 * Describes the network exposure of a resource — where it sits relative
 * to the internet and internal networks.
 *
 * This helps security and compliance teams understand the blast radius
 * if a resource is misconfigured or compromised.
 *
 * **Quick guide:**
 * - {@link INTERNAL} — Only reachable from within your VPC / private network.
 * - {@link INTERNET_FACING} — Directly reachable from the public internet.
 * - {@link PERIMETER} — Sits at the boundary, inspecting or filtering traffic (WAF, proxy).
 * - {@link ISOLATED} — No network connectivity at all, or only via VPC endpoints.
 */
export class ExposureTag {
  constructor(private readonly parent: GovUKTag) {}

  /**
   * Reachable only from within your private network (VPC, private subnets,
   * internal services). Not exposed to the internet in any way.
   *
   * **Examples:** A Lambda in a private subnet calling an internal API,
   * a DynamoDB table (accessed via VPC endpoint), an RDS instance in a
   * private subnet group, an internal ALB with no public listener.
   *
   * @example
   * ```ts
   * GovUKTag.of(myLambda).Exposure.INTERNAL();
   * ```
   */
  INTERNAL(): GovUKTag {
    return this.parent.add(EXPOSURE_TAG, EXPOSURE_CONTROL_VALUES.INTERNAL);
  }

  /**
   * Directly reachable from the public internet. Any user or bot on the
   * planet can attempt to connect to this resource.
   *
   * **Examples:** A public-facing ALB, a CloudFront distribution, an API
   * Gateway with no private endpoint, an EC2 instance with a public IP,
   * a public S3 bucket serving a static website.
   *
   * **Security implication:** Internet-facing resources are your attack
   * surface. They need WAF rules, rate limiting, and careful IAM policies.
   *
   * @example
   * ```ts
   * GovUKTag.of(publicAlb).Exposure.INTERNET_FACING();
   * ```
   */
  INTERNET_FACING(): GovUKTag {
    return this.parent.add(
      EXPOSURE_TAG,
      EXPOSURE_CONTROL_VALUES.INTERNET_FACING,
    );
  }

  /**
   * Sits at the network boundary, inspecting, filtering, or proxying traffic
   * between zones. These are your gatekeepers.
   *
   * **Examples:** A WAF Web ACL in front of your ALB, a bastion host,
   * a proxy appliance, a Network Firewall, an outbound NAT gateway used
   * for egress filtering.
   *
   * **When to use:** If the resource's primary job is to decide what traffic
   * passes through (rather than serving application logic), it's perimeter.
   *
   * @example
   * ```ts
   * GovUKTag.of(wafAcl).Exposure.PERIMETER();
   * ```
   */
  PERIMETER(): GovUKTag {
    return this.parent.add(EXPOSURE_TAG, EXPOSURE_CONTROL_VALUES.PERIMETER);
  }

  /**
   * No network connectivity, or only reachable via a tightly scoped VPC
   * endpoint. Completely cut off from both the internet and the broader
   * internal network.
   *
   * **Examples:** An S3 bucket accessible only via a gateway endpoint with
   * a restrictive policy, a Lambda in an isolated subnet with no NAT or
   * internet gateway, a KMS key (no network path — accessed via API only
   * through IAM), resources in a fully isolated VPC with no peering.
   *
   * @example
   * ```ts
   * GovUKTag.of(isolatedBucket).Exposure.ISOLATED();
   * ```
   */
  ISOLATED(): GovUKTag {
    return this.parent.add(EXPOSURE_TAG, EXPOSURE_CONTROL_VALUES.ISOLATED);
  }
}
