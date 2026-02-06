import { AfterAll, setDefaultTimeout } from '@cucumber/cucumber';
import { clearConsumerConfig } from './secrets-manager';
import { cleanupCreatedUsers } from './cleanup';

setDefaultTimeout(30000);

AfterAll(async function () {
  await cleanupCreatedUsers();
  clearConsumerConfig();
});
