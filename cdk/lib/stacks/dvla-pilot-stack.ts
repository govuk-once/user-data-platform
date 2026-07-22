import { Stack, StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import * as kms from 'aws-cdk-lib/aws-kms';
import { PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import { getLogRetentionPeriod } from 'cdk/constants/environment';

export interface DvlaPilotStackProps extends StackProps {
  developerId?: string;
  environment: string;
  stackPrefix: string;
  identityTable: Table;
  kmsKey: IKey;
  dbKmsKey: IKey;
  vpc?: IVpc;
  lambdaSecurityGroups?: ISecurityGroup;
}

export class DvlaPilotStack extends Stack {
  constructor(scope: Construct, id: string, props: DvlaPilotStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      stackPrefix,
      identityTable,
      kmsKey,
      dbKmsKey,
      vpc,
      lambdaSecurityGroups,
    } = props;

    const purgeKeySecret = Secret.fromSecretNameV2(
      this,
      'DvlaPilotPurgeKeySecret',
      '/identity/dvla/pilot/purge-key',
    );

    const dvlaPilotPurgeLambda = new LambdaApiConstruct(
      this,
      'dvlaPilotPurge',
      {
        developerId,
        environment,
        functionName: 'dvla-pilot-purge',
        sourcePath: 'dvlaPilotPurgeLambda',
        kmsKey,
        dbKmsKey,
        identityDbTable: identityTable,
        identityDbActions: ['dynamodb:Scan', 'dynamodb:DeleteItem'],
        environmentVariables: {
          STACK: stackPrefix,
          SERVICE_NAME: 'dvlaPilotPurge',
          PURGE_KEY_SECRET_NAME: purgeKeySecret.secretName,
        },
        vpc,
        securityGroups: lambdaSecurityGroups ? [lambdaSecurityGroups] : [],
        logRetentionDays: getLogRetentionPeriod(environment),
      },
    );

    purgeKeySecret.grantRead(dvlaPilotPurgeLambda.function);

    const udpParamsSecretsEncryptionKey = kms.Alias.fromAliasName(
      this,
      'UDPParamsSecretsEncryptionKey',
      `udp-params-secrets-encryption-key-${environment}`,
    );

    udpParamsSecretsEncryptionKey.grantDecrypt(dvlaPilotPurgeLambda.function);
  }
}
