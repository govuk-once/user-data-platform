import { Stack, StackProps } from 'aws-cdk-lib';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { ISecurityGroup, IVpc } from 'aws-cdk-lib/aws-ec2';
import { IKey } from 'aws-cdk-lib/aws-kms';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as signer from 'aws-cdk-lib/aws-signer';
import { Construct } from 'constructs';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import {
  environmentLongNames,
  getLogRetentionPeriod,
} from 'cdk/constants/environment';
import { GovUKTag } from '@govuk-connect/tag';

export interface DvlaPilotStackProps extends StackProps {
  developerId?: string;
  environment: string;
  stackPrefix: string;
  identityTable: Table;
  kmsKey: IKey;
  dbKmsKey: IKey;
  vpc?: IVpc;
  lambdaSecurityGroups?: ISecurityGroup;
  dynamoDbEndpointUrl?: string;
  signingProfile: signer.SigningProfile;
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
      dynamoDbEndpointUrl,
      signingProfile,
    } = props;

    const codeSigningConfig = new lambda.CodeSigningConfig(
      this,
      'CodeSigningConfig',
      {
        signingProfiles: [signingProfile],
        untrustedArtifactOnDeployment:
          lambda.UntrustedArtifactOnDeployment.ENFORCE,
      },
    );

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
          ...(dynamoDbEndpointUrl
            ? { DYNAMODB_ENDPOINT: dynamoDbEndpointUrl }
            : {}),
        },
        vpc,
        securityGroups: lambdaSecurityGroups ? [lambdaSecurityGroups] : [],
        logRetentionDays: getLogRetentionPeriod(environment),
        codeSigningConfig,
      },
    );
    GovUKTag.of(dvlaPilotPurgeLambda)
      .DataClassification.OFFICIAL_SENSITIVE()
      .PII.TRUE()
      .Exposure.INTERNAL();

    purgeKeySecret.grantRead(dvlaPilotPurgeLambda.function);

    const udpParamsSecretsEncryptionKey = kms.Alias.fromAliasName(
      this,
      'UDPParamsSecretsEncryptionKey',
      `alias/udp-params-secrets-encryption-key-${environmentLongNames[environment]}`,
    );

    udpParamsSecretsEncryptionKey.grantDecrypt(dvlaPilotPurgeLambda.function);
  }
}
