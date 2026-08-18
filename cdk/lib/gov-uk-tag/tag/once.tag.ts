import { GovUKTag, GovUKEnvironments } from '../';
import {
  SHORT_TO_FULL,
  FULL_ENVIRONMENTS,
  OnceEnvironments,
  OnceSuggestedAppTags,
} from './tag.const';

/**
 * Tag helpers for GOV.UK Tagging / Once-level tags.
 */
export class OnceTag {
  constructor(private readonly parent: typeof GovUKTag) {}

  /**
   * Suggested tag sets for each known platform app, keyed by app name.
   */
  public get Suggested(): typeof OnceSuggestedAppTags {
    return OnceSuggestedAppTags;
  }

  /**
   * Type guard for a full GOV.UK environment name, e.g. `development`.
   *
   * @param value - Lower-cased candidate environment name.
   */
  private isFullEnvironment(value: string): value is GovUKEnvironments {
    return FULL_ENVIRONMENTS.has(value);
  }

  /**
   * Type guard for a short environment name, e.g. `dev`.
   *
   * @param value - Lower-cased candidate environment name.
   */
  private isShortEnvironment(value: string): value is OnceEnvironments {
    return value in SHORT_TO_FULL;
  }

  /**
   * Resolve an environment name to its full GOV.UK form.
   *
   * Accepts either a short name (`dev`, `stag`, `prod`) or a full name
   * (`sandbox`, `build`, `development`, `integration`, `staging`,
   * `production`). Input is trimmed and lower-cased before matching, so
   * values taken straight from CDK context or environment variables are fine.
   *
   * @param environment - Short or full environment name.
   * @returns The corresponding full environment name.
   * @throws Error if `environment` is empty or unrecognised.
   *
   * @example
   * ```ts
   * tags.mapEnvironment('dev');        // GovUkOnceFullEnvironments.DEVELOPMENT
   * tags.mapEnvironment('SANDBOX');    // GovUkOnceFullEnvironments.SANDBOX
   * ```
   */
  public mapEnvironment(environment: string): GovUKEnvironments {
    if (!environment) throw new Error('Environment is empty');

    const value = environment.trim().toLowerCase();

    if (this.isFullEnvironment(value)) return value;
    if (this.isShortEnvironment(value)) return SHORT_TO_FULL[value];

    throw new Error(`Environment not found: ${environment}`);
  }
}
