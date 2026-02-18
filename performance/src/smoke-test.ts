import { Options } from 'k6/options';
import {
  deleteData,
  deleteIdentity,
  getData,
  getIdentity,
  postData,
  postIdentity,
  postUser,
} from './helpers/requests';

export const options: Options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate==0'],
    http_req_duration: ['p(95)<2000'],
  },
};

const APP_ID = 'smoke-test-user';

const dataHeaders = {
  'requesting-service': 'app',
  'requesting-service-user-id': APP_ID,
};

export default function () {
  postUser({ appId: APP_ID, serviceName: 'app' });

  postData('/smoke/topics', { data: { test: 'smoke' } }, dataHeaders);
  getData('/smoke/topics', dataHeaders);
  deleteData('/smoke/topics', dataHeaders);

  postIdentity('smoke-svc', APP_ID, { appId: APP_ID });
  getIdentity('smoke-svc', APP_ID);
  deleteIdentity('smoke-svc', APP_ID);

  deleteIdentity('app', APP_ID);
}
