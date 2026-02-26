import { Options } from 'k6/options';
import { nfr } from '../config';
import { createScenarioRunner } from '../helpers/scenario-runner';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const { run, teardown: scenarioTeardown } = createScenarioRunner({
  testPrefix: 'per-stress-writes',
  trafficWeights: [
    { op: 'postData', cumulative: 50 },
    { op: 'postIdentity', cumulative: 85 },
    { op: 'postUser', cumulative: 100 },
  ],
});

export const options: Options = {
  scenarios: {
    baseline: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 500,
      stages: [
        { duration: '1m', target: 10 },
        { duration: '1m', target: 20 },
        { duration: '1m', target: 30 },
        { duration: '1m', target: 40 },
        { duration: '1m', target: 50 },
        { duration: '1m', target: 60 },
        { duration: '1m', target: 70 },
        { duration: '1m', target: 80 },
        { duration: '1m', target: 90 },
        { duration: '1m', target: 100 },
        { duration: '1m', target: 110 },
        { duration: '1m', target: 120 },
        { duration: '1m', target: 130 },
        { duration: '1m', target: 140 },
        { duration: '1m', target: 150 },
        { duration: '1m', target: 160 },
        { duration: '1m', target: 170 },
        { duration: '1m', target: 180 },
        { duration: '1m', target: 190 },
        { duration: '1m', target: 200 },
        { duration: '1m', target: 210 },
        { duration: '1m', target: 220 },
        { duration: '1m', target: 230 },
        { duration: '1m', target: 240 },
        { duration: '1m', target: 250 },
        { duration: '1m', target: 260 },
        { duration: '1m', target: 270 },
        { duration: '1m', target: 280 },
        { duration: '1m', target: 290 },
        { duration: '1m', target: 300 },
      ],
    },
  },
  thresholds: {
    'http_req_duration{scenario:baseline}': [`p(95)<${nfr.P95_LATENCY_MS}`],
    'http_req_failed{scenario:baseline}': [
      {
        threshold: `rate<${nfr.MAX_ERROR_RATE}`,
        abortOnFail: true,
        delayAbortEval: '30s',
      },
    ],
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
