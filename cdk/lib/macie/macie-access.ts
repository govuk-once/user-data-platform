import { Stack } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';

export class MacieAccess {
  static slrArn(scope: Construct): string {
    const s = Stack.of(scope);
    return `arn:${s.partition}:iam::${s.account}:role/aws-service-role/macie.amazonaws.com/AWSServiceRoleForAmazonMacie`;
  }

  /**
   * grantKeyDecrypt
   *
   * Enable Macie to decrypt objects encrypted with this key.
   * @param key: kms.IKey
   */
  static grantKeyDecrypt(key: kms.IKey): void {
    key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: 'AllowMacieDecrypt',
        effect: iam.Effect.ALLOW,
        principals: [new iam.ArnPrincipal(MacieAccess.slrArn(key))],
        actions: ['kms:Decrypt', 'kms:DescribeKey'],
        resources: ['*'],
      }),
    );
  }

  /**
   * markKMSKeyForAccess
   *
   * Add metadata to the key to be picked up by MacieAccess Aspect
   * @param key: kms.IKey
   */
  static markKMSKeyForAccess(construct: kms.IKey): void {
    construct.node.addMetadata('macie:grant-key-decrypt', true);
  }
}
