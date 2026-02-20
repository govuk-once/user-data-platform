import { fromNodeProviderChain } from '@aws-sdk/credential-providers';

const credentials = await fromNodeProviderChain()();

console.log(`export AWS_ACCESS_KEY_ID=${credentials.accessKeyId}`);
console.log(`export AWS_SECRET_ACCESS_KEY=${credentials.secretAccessKey}`);
if (credentials.sessionToken) {
  console.log(`export AWS_SESSION_TOKEN=${credentials.sessionToken}`);
}
