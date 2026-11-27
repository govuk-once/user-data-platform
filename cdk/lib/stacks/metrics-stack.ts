import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as signer from 'aws-cdk-lib/aws-signer';
import { Construct } from 'constructs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import {
  SecurityGroup,
  SubnetSelection,
  SubnetType,
  Vpc,
} from 'aws-cdk-lib/aws-ec2';
import { getLogRetentionPeriod } from 'cdk/constants/environment';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import { mainStackParameterNames } from 'cdk/constants/shared-parameters';

export interface MetricsStackProps extends StackProps {
  developerId?: string;
  environment: string;
  stackPrefix: string;
  signingProfile: signer.SigningProfile;
}

export class MetricsStack extends Stack {
  public readonly metricsLambda: lambda.IFunction;

  constructor(scope: Construct, id: string, props: MetricsStackProps) {
    super(scope, id, props);

    const { developerId, environment, stackPrefix, signingProfile } = props;

    const namePrefix = developerId ? `${developerId}-` : '';

    const params = mainStackParameterNames(stackPrefix);
    const resolve = (name: string) =>
      StringParameter.valueForStringParameter(this, name);

    const kmsKey = Key.fromKeyArn(this, 'KmsKey', resolve(params.kmsKeyArn));

    const identityTable = Table.fromTableAttributes(this, 'IdentityTable', {
      tableName: `${namePrefix}udp-identity-${environment}`,
    });

    const vpc = Vpc.fromLookup(this, 'Vpc', {
      vpcName: `udp-api-vpc-${environment}`,
      tags: { 'aws:cloudformation:stack-name': `${environment}-vpc` },
    });

    const isolatedSubnets: SubnetSelection = {
      subnetType: SubnetType.PRIVATE_ISOLATED,
    };

    const lambdaSecurityGroup = new SecurityGroup(this, 'MetricsLambdaSg', {
      vpc,
      description: 'Security group for metrics lambda',
      securityGroupName: `${namePrefix}metrics-lambda-sg-${environment}`,
    });

    const codeSigningConfig = new lambda.CodeSigningConfig(
      this,
      'CodeSigningConfig',
      {
        signingProfiles: [signingProfile],
        untrustedArtifactOnDeployment:
          lambda.UntrustedArtifactOnDeployment.ENFORCE,
      },
    );

    const metricsConstruct = new LambdaApiConstruct(this, 'Metrics', {
      developerId,
      environment,
      functionName: 'metricsLambda',
      sourcePath: 'metricsLambda',
      kmsKey,
      timeout: Duration.minutes(5),
      memorySize: 1024,
      vpc,
      vpcSubnets: isolatedSubnets,
      securityGroups: [lambdaSecurityGroup],
      logRetentionDays: getLogRetentionPeriod(environment),
      codeSigningConfig,
      disableRoute: true,
      environmentVariables: {
        STACK: stackPrefix,
        SERVICE_NAME: 'udpMetrics',
        POWERTOOLS_SERVICE_NAME: 'udpMetrics',
        IDENTITY_TABLE_NAME: identityTable.tableName,
      },
    });

    identityTable.grantReadData(metricsConstruct.function);

    this.metricsLambda = metricsConstruct.function;
  }
}
