import { GovUKTag, GovUKEnvironments } from '..';
import {
  SHORT_TO_FULL,
  FULL_ENVIRONMENTS,
  OnceEnvironments,
  OnceSuggestedAppTags,
} from './tag.const';

/**
 * Helpers for GOV.UK One Login ("Once") platform-level tagging.
 *
 * Once is the shared platform that hosts multiple product teams (Flex, UDP,
 * UNS). This class provides:
 *
 * - **{@link Suggested}** — Pre-built tag sets for each known platform app,
 *   so you don't have to look up the correct Product/Service/Owner values.
 * - **{@link mapEnvironment}** — Resolves short environment names (`dev`,
 *   `stag`, `prod`) to the full canonical form expected by the tagging standard.
 *
 * @example
 * ```ts
 * // Use suggested tags for the UDP app
 * const { Product, Service, Component, Environment, Owner, Source } =
 *   GovUKTag.Once.Suggested.UDP;
 *
 * // Resolve an environment from CI context
 * const env = GovUKTag.Once.mapEnvironment(process.env.ENVIRONMENT!);
 * ```
 */
export class OnceTag {
  constructor(private readonly parent: typeof GovUKTag) {}

  /**
   * Pre-configured mandatory + optional tag sets for each Once platform app.
   *
   * These are the "correct answers" for each app's Product, Service, Component,
   * Owner, Source, RepositoryUrl, and BillingProject tags. Use them as defaults
   * when calling `GovUKTag.applyAspect()` so you don't have to guess or
   * copy-paste values between repos.
   *
   * **Available presets:**
   *
   * - **`Flex`** — The Flex identity orchestration service. Owns the flexible
   *   identity journeys and credential management flows.
   *
   * - **`UDP`** — User Data Platform. The shared data layer that stores and
   *   manages user identity data across One Login services.
   *
   * - **`UNS`** — United Notification Service. Handles all outbound
   *   notifications (email, SMS, push) for One Login products.
   *
   * Each preset includes a valid `RepositoryUrl` and `BillingProject` so you
   * get optional tags for free. Override individual fields by spreading:
   *
   * @example
   * ```ts
   * // Use UDP defaults but override the component name
   * GovUKTag.applyAspect(app, {
   *   mandatoryAppTags: {
   *     ...GovUKTag.Once.Suggested.UDP,
   *     Component: 'my-specific-service',
   *     Environment: GovUKTag.Once.mapEnvironment(env),
   *   },
   * });
   * ```
   */
  public get Suggested(): typeof OnceSuggestedAppTags {
    return OnceSuggestedAppTags;
  }

  /**
   * Type guard for a full GOV.UK environment name, e.g. `development`.
   */
  private isFullEnvironment(value: string): value is GovUKEnvironments {
    return FULL_ENVIRONMENTS.has(value);
  }

  /**
   * Type guard for a short environment name, e.g. `dev`.
   */
  private isShortEnvironment(value: string): value is OnceEnvironments {
    return value in SHORT_TO_FULL;
  }

  /**
   * Resolve an environment name to its full canonical form.
   *
   * Accepts either short names (`dev`, `stag`, `prod`) or full names
   * (`sandbox`, `build`, `development`, `integration`, `staging`, `production`).
   * Input is trimmed and lowercased, so values straight from CI environment
   * variables or CDK context work without preprocessing.
   *
   * **Mapping:**
   * | Short | Full               |
   * |-------|--------------------|
   * | `dev` | `development`      |
   * | `stag`| `staging`          |
   * | `prod`| `production`       |
   *
   * Full names (`sandbox`, `build`, `development`, `integration`, `staging`,
   * `production`) pass through unchanged.
   *
   * @param environment - Short or full environment name.
   * @returns The canonical full environment string.
   * @throws If `environment` is empty or doesn't match any known value.
   *
   * @example
   * ```ts
   * GovUKTag.Once.mapEnvironment('dev');        // 'development'
   * GovUKTag.Once.mapEnvironment('PRODUCTION'); // 'production'
   * GovUKTag.Once.mapEnvironment('sandbox');    // 'sandbox'
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
