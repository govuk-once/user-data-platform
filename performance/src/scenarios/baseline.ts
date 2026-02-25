import { Options } from 'k6/options';
import { nfr } from '../config';
import { createScenarioRunner } from '../helpers/scenario-runner';

const { run, teardown: scenarioTeardown } = createScenarioRunner({
  testPrefix: 'per-baseline',
  trafficWeights: [
    { op: 'getData', cumulative: 50 },
    { op: 'getIdentity', cumulative: 70 },
    { op: 'postData', cumulative: 85 },
    { op: 'postIdentity', cumulative: 90 },
    { op: 'postUser', cumulative: 92 },
    { op: 'deleteData', cumulative: 97 },
    { op: 'deleteIdentity', cumulative: 100 },
  ],
});

export const options: Options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: nfr.TARGET_RPS,
      timeUnit: '1s',
      duration: '15m',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_duration{scenario:baseline}': [`p(95)<${nfr.P95_LATENCY_MS}`],
    'http_req_failed{scenario:baseline}': [`rate<${nfr.MAX_ERROR_RATE}`],
  },
};

export default run;

export const teardown = scenarioTeardown;
