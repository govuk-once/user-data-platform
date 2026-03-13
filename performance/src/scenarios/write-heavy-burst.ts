import { Options } from 'k6/options';
import { nfr } from '../config';
import { createScenarioRunner } from '../helpers/scenario-runner';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

const { run, teardown: scenarioTeardown } = createScenarioRunner({
  testPrefix: 'per-write-heavy-burst',
  trafficWeights: [
    { op: 'postData', cumulative: 50 },
    { op: 'patchData', cumulative: 70 },
    { op: 'postIdentity', cumulative: 90 },
    { op: 'postUser', cumulative: 100 },
  ],
});

export const options: Options = {
  scenarios: {
    writeHeavyBurst: {
      executor: 'ramping-arrival-rate',
      startRate: 10,
      timeUnit: '1s',
      preAllocatedVUs: 100,
      maxVUs: 400,
      stages: [
        { duration: '2m', target: 10 }, // Warm-up at baseline
        { duration: '3m', target: 50 }, // Ramp to moderate load
        { duration: '2m', target: 50 }, // Sustain moderate load
        { duration: '3m', target: 150 }, // Burst to high load
        { duration: '3m', target: 150 }, // Sustain high load
        { duration: '2m', target: 250 }, // Burst to peak load
        { duration: '3m', target: 250 }, // Sustain peak load to detect throttling
        { duration: '2m', target: 50 }, // Ramp down
        { duration: '1m', target: 10 }, // Cool down
      ],
    },
  },
  thresholds: {
    'http_req_duration{scenario:writeHeavyBurst}': [
      `p(95)<${nfr.P95_LATENCY_MS}`,
    ],
    'http_req_failed{scenario:writeHeavyBurst}': [
      {
        threshold: `rate<${nfr.MAX_ERROR_RATE}`,
        abortOnFail: true,
        delayAbortEval: '60s',
      },
    ],
    // Additional thresholds to detect DynamoDB throttling
    'http_req_duration{scenario:writeHeavyBurst,op:postData}': [
      `p(99)<${nfr.P95_LATENCY_MS * 2}`,
    ],
    'http_req_duration{scenario:writeHeavyBurst,op:postIdentity}': [
      `p(99)<${nfr.P95_LATENCY_MS * 2}`,
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
    '/tmp/k6-summary-write-heavy-burst.json': JSON.stringify(data),
  };
}
