import { nfr } from './config';

export const threasholds = {
  http_req_duration: [`p(95)<${nfr.P95_LATENCY_MS}`],
  http_req_failed: [`rate<${nfr.MAX_ERROR_RATE}`],
  http_reqs: [`rate<${nfr.TARGET_RPS}`],
};
