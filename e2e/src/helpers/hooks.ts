import { AfterAll, Before } from '@cucumber/cucumber';
import { clearTokenCache } from './auth';

AfterAll(async function () {
  clearTokenCache();
});
