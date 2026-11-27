import type { RouteConfig } from '@libs/utils';

/**
 * Critical-alerting SLOs. See docs/critical-alerting.md.
 *
 * C1–C3 page on a fast error-budget burn: the bad-request rate must exceed
 * SLO_FAST_BURN_RATE x the error budget over BOTH the long and the short
 * window. A 14.4x burn spends 2% of a 30-day budget in one hour.
 *
 * A "bad request" is an API Gateway 5xx. Latency is deliberately left out of
 * the critical SLI so Lambda cold starts can never page anyone; slow
 * responses are covered by the (warning) latency alarms instead.
 */
export const SLO_FAST_BURN_RATE = 14.4;

/** Minimum requests in the long window before C1–C3/C7 may fire. */
export const SLO_MIN_REQUESTS = 20;

export type JourneyKey = 'reads' | 'writes' | 'identity';

export interface JourneySlo {
  readonly journey: string;
  readonly alarmSlug: string;
  /** Allowed bad-request percentage over 30 days, e.g. 0.5 for 99.5%. */
  readonly errorBudgetPercent: number;
  readonly alertText: string;
  readonly matches: (route: RouteConfig) => boolean;
}

const isDataRoute = (route: RouteConfig) => route.tags.includes('data');

export const JOURNEY_SLOS: Record<JourneyKey, JourneySlo> = {
  reads: {
    journey: 'J1 - Read user data',
    alarmSlug: 'c1-reads-degraded',
    errorBudgetPercent: 0.5, // 99.5% -> 7.2% threshold
    alertText:
      '🔴 READS DEGRADED: User data reads are failing at a critical rate.',
    matches: (route) => isDataRoute(route) && route.method === 'GET',
  },
  writes: {
    journey: 'J2 - Update user data',
    alarmSlug: 'c2-writes-degraded',
    errorBudgetPercent: 0.1, // 99.9% -> 1.44% threshold
    alertText:
      '🔴 WRITES DEGRADED: User data updates are failing at a critical rate.',
    matches: (route) => isDataRoute(route) && route.method !== 'GET',
  },
  identity: {
    journey: 'J3 - Identity and linking',
    alarmSlug: 'c3-identity-degraded',
    errorBudgetPercent: 0.5, // 99.5% -> 7.2% threshold
    alertText:
      '🔴 IDENTITY DEGRADED: Identity requests are failing at a critical rate.',
    matches: (route) =>
      route.tags.includes('identity') || route.tags.includes('user'),
  },
};

/** Bad-request percentage that triggers a journey's critical alarm. */
export const burnRateThresholdPercent = (slo: JourneySlo): number =>
  Math.round(slo.errorBudgetPercent * SLO_FAST_BURN_RATE * 1000) / 1000;
