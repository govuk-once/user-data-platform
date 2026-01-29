import { AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { clearConsumerConfig } from './secrets-manager';

setDefaultTimeout(30000);

AfterAll(async function () {
  clearConsumerConfig();
});
