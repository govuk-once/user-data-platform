import { Options } from 'k6/options';
import exec from 'k6/execution';
import http from 'k6/http';

import { nfr } from '../config';
import {
  postUser,
  postData,
  postIdentity,
  getData,
  getIdentity,
  deleteData,
  deleteIdentity,
} from '../helpers/requests';

export interface TestUser {
  appId: string;
  dataPath: string;
  headers: Record<string, string>;
}

export interface TrafficWeight {
  op: string;
  cumulative: number;
}

export interface ScenarioConfig {
  testPrefix: string;
  trafficWeights: TrafficWeight[];
}

http.setResponseCallback(http.expectedStatuses(200, 204, 404));

const SERVICE_NAME = 'perf-svc';

function createTestUser(appId: string): TestUser {
  return {
    appId,
    dataPath: `topics`,
    headers: {
      'requesting-service': 'app',
      'requesting-service-user-id': appId,
    },
  };
}

export function createScenarioRunner(config: ScenarioConfig): {
  run: () => void;
  teardown: () => void;
} {
  const { testPrefix, trafficWeights } = config;
  const vuUserPools: Map<number, TestUser[]> = new Map();

  function pickOperation(): string {
    const rand = Math.random() * 100;
    for (const entry of TRAFFIC_WEIGHTS) {
      if (rand < entry.cumulative) return entry.op;
    }
    return 'getData';
  }

  function getUserPool(vuid: number): TestUser[] {
    let pool = vuUserPools.get(vuid);
    if (!pool) {
      const appId = `${TEST_PREFIX}-vu-${vuid}`;
      const user = createTestUser(appId);
      postUser({ appId, serviceName: 'app' });
      pool = [user];
      vuUserPools.set(vuid, pool);
    }
    return pool;
  }

  function pickUser(pool: TestUser[]): TestUser {
    return pool[Math.floor(Math.random()) * pool.length];
  }

  function run() {
    const vuId = exec.vu.idInTest;
    const iter = exec.scenario.iterationInTest;
    const pool = getUserPool(vuId);
    const user = pickUser(pool);
    const op = pickOperation();

    switch (op) {
      case 'getData':
        getData(user.dataPath, user.headers);
        break;
      case 'getIdentity':
        getIdentity(SERVICE_NAME, `identity-${user.appId}`);
        break;
      case 'postData':
        postData(
          user.dataPath,
          { data: { vu: vuId, iter, ts: Date.now() } },
          user.headers,
        );
        break;
      case 'postIdentity':
        postIdentity(SERVICE_NAME, `identity-${user.appId}`, {
          appId: user.appId,
        });
        break;
      case 'postUser': {
        const newAppId = `${TEST_PREFIX}-new-${vuId}-${iter}`;
        const newUser = createTestUser(newAppId);

        postUser({ appId: newAppId, serviceName: 'app' });

        pool.push(newUser);
        break;
      }
      case 'deleteData':
        deleteData(user.dataPath, user.headers);
        break;
      case 'deleteIdentity':
        deleteIdentity(SERVICE_NAME, `identity-${user.appId}`);
        break;
    }
  }

  function teardown(): void {
    for (const [, pool] of vuUserPools) {
      for (const user of pool) {
        deleteData(user.dataPath, user.headers);
        deleteIdentity(SERVICE_NAME, user.appId);
        deleteIdentity('app', user.appId);
      }
    }
  }

  return { run, teardown };
}

const PRE_ALLOCATED_VUS = 50;

export const options: Options = {
  scenarios: {
    baseline: {
      executor: 'constant-arrival-rate',
      rate: nfr.TARGET_RPS,
      timeUnit: '1s',
      duration: '15m',
      preAllocatedVUs: PRE_ALLOCATED_VUS,
      maxVUs: 200,
    },
  },
  thresholds: {
    'http_req_duration{scenario:baseline}': [`p(95)<${nfr.P95_LATENCY_MS}`],
    'http_req_failed{scenario:baseline}': [`rate<${nfr.MAX_ERROR_RATE}`],
  },
};



