import { Options } from 'k6/options';
import { nfr } from '../config';
import { createScenarioRunner } from '../helpers/scenario-runner';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const { run, teardown: scenarioTeardown } = createScenarioRunner({
  testPrefix: 'per-baseline',
  trafficWeights: [
    { op: 'getData', cumulative: 50 },
    { op: 'getIdentity', cumulative: 80 },
    { op: 'postData', cumulative: 88 },
    { op: 'postIdentity', cumulative: 93 },
    { op: 'postUser', cumulative: 95 },
    { op: 'deleteData', cumulative: 98 },
    { op: 'deleteIdentity', cumulative: 100 },
  ],
});

export const options: Options = {
  scenarios: {
    baseline: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 300,
      stages: [{ duration: '1m', target: 10 }],
    },
  },
  thresholds: {
    'http_req_duration{scenario:baseline}': [`p(95)<${nfr.P95_LATENCY_MS}`],
    'http_req_failed{scenario:baseline}': [`rate<${nfr.MAX_ERROR_RATE}`],
  },
};

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
