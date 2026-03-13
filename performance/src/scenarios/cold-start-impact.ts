import { Options } from 'k6/options';
import { Trend } from 'k6/metrics';
import { nfr } from '../config';
import { createScenarioRunner } from '../helpers/scenario-runner';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

/**
 * Custom metric capturing itteration durations during inisial cold start
 * window (first 30seconds of the test). Each itteration makes a http request via the scenario runner
 *
 */
const coldStartLatency = new Trend('cold_start_latecncy', true);

const COLD_START_WINDOW_MS = 30_000;

const { run: baseRun, teardown: scenarioTeardown } = createScenarioRunner({
  testPrefix: 'per-cold-start',
  trafficWeights: [
    { op: 'getData', cumulative: 25 },
    { op: 'getIdentity', cumulative: 50 },
    { op: 'getLinkedIdentity', cumulative: 60 },
    { op: 'postData', cumulative: 75 },
    { op: 'patchData', cumulative: 80 },
    { op: 'postIdentity', cumulative: 85 },
    { op: 'postUser', cumulative: 90 },
    { op: 'deleteData', cumulative: 95 },
    { op: 'deleteIdentity', cumulative: 100 },
  ],
});

let scenarioStartTime = 0;

export const options: Options = {
  scenarios: {
    'cold-start-impact': {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 10,
      maxVUs: 300,
      stages: [
        { duration: '30s', target: 100 }, // immediate demand
        { duration: '3m', target: 100 }, // sustained demand
        { duration: '1m', target: 200 }, // scaling event demand
        { duration: '3m', target: 200 }, // susttained scalong demand
        { duration: '2m', target: 10 }, // cool down
      ],
    },
  },
  thresholds: {
    'http_req_duration{scenario:baseline}': [`p(95)<${nfr.P95_LATENCY_MS}`],
    'http_req_failed{scenario:baseline}': [`rate<${nfr.MAX_ERROR_RATE}`],
    cold_start_latency: [`p(95)<${nfr.P95_LATENCY_MS}`],
  },
};

function run() {
  if (scenarioStartTime === 0) {
    scenarioStartTime = Date.now();
  }

  const iterStart = Date.now();

  baseRun();

  const elapsedMs = iterStart - scenarioStartTime;
  if (elapsedMs <= COLD_START_WINDOW_MS) {
    coldStartLatency.add(Date.now() - iterStart);
  }
}

export default run;

export const teardown = scenarioTeardown;

export function handleSummary(
  data: Record<string, unknown>,
): Record<string, string> {
  return {
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
    '/tmp/k6-summary.json': JSON.stringify(data),
  };
}
