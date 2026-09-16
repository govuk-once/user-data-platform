import { GovUKEnvironments } from '.';

export interface GovUKMandatoryAppTags {
  /** Identifies the product or programme the resource supports. */
  Product: string;
  /** Identifies the service boundary that owns or operates the resource. */
  Service: string;
  /** Identifies the application, subsystem, or infrastructure component. */
  Component: string;
  /** Identifies the deployment environment. */
  Environment: GovUKEnvironments;
  /** Identifies the team or group accountable for the resource. */
  Owner: string;
  /** Identifies the source repository or deployment source that created the resource. */
  Source: string;
}

export interface GovUKOptionalAppTags {
  RepositoryUrl?: string;
  BillingProject?: string;
}

export interface GovUKTagAspectProps {
  mandatoryAppTags: GovUKMandatoryAppTags;
  optionalAppTags?: GovUKOptionalAppTags;
  disabled?: boolean;
}
