import { IAspect } from 'aws-cdk-lib';
import { IConstruct } from 'constructs';
import * as kms from 'aws-cdk-lib/aws-kms';

import { MacieAccess } from './macie-access';

export class MacieAccessAspect implements IAspect {
  visit(node: IConstruct): void {
    const wants = node.node.metadata.some(
      (m) => m.type === 'macie:grant-key-decrypt',
    );
    if (!wants) return;
    MacieAccess.grantKeyDecrypt(node as kms.IKey);
  }
}
