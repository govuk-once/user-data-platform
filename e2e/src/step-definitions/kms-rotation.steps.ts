import { Then, When } from '@cucumber/cucumber';
import { config } from 'src/helpers/config';
import { KMSClient, RotateKeyOnDemandCommand } from '@aws-sdk/client-kms';
import { CustomWorld } from 'src/helpers/world';
import { expect } from 'vitest';

let rotationResponse: { keyId?: string } | null = null;

When('I rotate the KMS encryption key', async function (this: CustomEvent) {
  const kmsKeyArn = config.kmsKeyArn;
  if (!kmsKeyArn) {
    throw new Error(
      'KMS_KEY_ARN is not configured - cannot perform rotation test',
    );
  }

  const client = new KMSClient({ region: config.awsRegion });
  const command = new RotateKeyOnDemandCommand({ KeyId: kmsKeyArn });
  rotationResponse = await client.send(command);
});

Then('the key rotation should succeed', function (this: CustomWorld) {
  expect(rotationResponse).toBeDefined();
  expect(rotationResponse?.keyId).toBeDefined();
});
