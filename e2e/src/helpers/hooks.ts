import { AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { clearTokenCache } from './auth';

setDefaultTimeout(30000);

AfterAll(async function () {
  clearTokenCache();
});
