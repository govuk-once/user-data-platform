import { Stack, StackProps } from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as macie from 'aws-cdk-lib/aws-macie';
import { Construct } from 'constructs';

export class MacieStack extends Stack {
  public macieSlr: iam.CfnServiceLinkedRole;
  public macieSlrArn: string;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    this.macieSlrArn = `arn:${this.partition}:iam::${this.account}:role/aws-service-role/macie.amazonaws.com/AWSServiceRoleForAmazonMacie`;

    this.macieSlr = new iam.CfnServiceLinkedRole(this, 'MacieSlr', {
      awsServiceName: 'macie.amazonaws.com',
    });

    const session = new macie.CfnSession(this, 'MacieSession', {
      status: 'ENABLED',
      findingPublishingFrequency: 'FIFTEEN_MINUTES',
    });
    session.node.addDependency(this.macieSlr);
  }
}
