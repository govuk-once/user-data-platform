import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

import { KmsConstruct } from '../constructs/kms-construct';
import { DynamoDBConstruct } from '../constructs/dynamodb-construct';
import { ApiGatewayConstruct } from '../constructs/api-gateway-construct';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import { AppConfigConstruct } from '../constructs/appconfig-construct';
import { featureFlagsByEnvironment } from '../../constants/appconfig-feature-flags';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as kms from 'aws-cdk-lib/aws-kms';
import { WafConstruct } from '../constructs/waf-construct';
import { routes } from '@libs/utils';

import {
  ConsumerConfigConstruct,
  ExternalConsumerConfig,
} from '../constructs/consumer-config-construct';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';
import { IRole } from 'aws-cdk-lib/aws-iam';
import {
  IamConsumerConfig,
  IamConsumerConstruct,
} from '../constructs/iam-consumer-construct';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import {
  environmentLongNames,
  GovUkOnceEnvironments,
} from 'cdk/constants/environment';
import {
  ConsumerThrottleConfig,
  ConsumerUsagePlanConstruct,
} from '../constructs/consumer-usage-plan-construct';


export interface MainStackProps extends StackProps {
  developerId?: string;
  environment: string;
  serviceName: string;
  teamName: string;
  repositoryUrl: string;
  version: string;
  stackPrefix: string;
  vpcEndpointId?: string;
  crossAccountPrincipals?: string[];
  vpc?: ec2.IVpc;
  lambdaSecurityGroup?: ec2.ISecurityGroup;
  codebuildSecurityGroup?: ec2.ISecurityGroup;
  availabilityZones?: string[];
}

export class MainStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly identityTable: dynamodb.Table;
  public readonly api: apigateway.RestApi;
  public readonly lambdas: lambda.Function[];
  public readonly kmsKey: kms.IKey;
  public readonly appConfigApplicationId: string;
  public readonly appConfigEnvironmentId: string;
  public readonly appConfigProfileId: string;
  public readonly e2eTestConsumerSecret?: ISecret;
  public readonly e2eTestConsumerRole?: IRole;
  public readonly e2eTestConsumerApiKeyValue?: string;

  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      serviceName,
      teamName,
      version,
      stackPrefix,
      vpcEndpointId,
      crossAccountPrincipals = [],
      vpc,
      lambdaSecurityGroup,
    } = props;

    const ssmPath = `/${environmentLongNames[environment]}/udp-param/udp/externalConsumers`;
    const ssmValue = StringParameter.valueFromLookup(this, ssmPath, '{}');

    let externalConsumers: Record<
      string,
      ExternalConsumerConfig & { vpcEndpointId?: string }
    > = {};
    try {
      externalConsumers = JSON.parse(ssmValue);
    } catch {}

    const consumerVpcEndpointIds: string[] = Object.values(externalConsumers)
      .map((c) => c.vpcEndpointId)
      .filter((id): id is string => !!id);

    cdk.Tags.of(this).add('ServiceName', serviceName || 'UnknownService');
    cdk.Tags.of(this).add('TeamName', teamName || 'UnknownTeam');
    cdk.Tags.of(this).add('Environment', environment || 'UnknownEnvironment');
    cdk.Tags.of(this).add('Version', version || '0.0.0');

    const cachingEnabled = environment !== GovUkOnceEnvironments.Dev;

    const kmsConstruct = new KmsConstruct(this, 'Kms', {
      developerId,
      environment,
      namePrefix: 'encryption',
    });
    this.kmsKey = kmsConstruct.key;

    const dbKms = new KmsConstruct(this, 'dbKms', {
      developerId,
      environment,
      namePrefix: 'db-kms-encryption',
    });

    const db = new DynamoDBConstruct(this, 'DynamoDb', {
      developerId,
      environment,
      tableName: 'udp-data',
      kmsKey: kmsConstruct.key,
      ttlAttributeName: 'ttl',
    });

    this.table = db.table;

    const identityDb = new DynamoDBConstruct(this, 'IdentityDynamoDb', {
      developerId,
      environment,
      tableName: 'udp-identity',
      kmsKey: kmsConstruct.key,
      globalSecondaryIndexes: [
        {
          indexName: 'sk-index',
          partitionKeyName: 'sk',
          sortKeyName: 'pk',
        },
      ],
      ttlAttributeName: 'ttl',
    });

    this.identityTable = identityDb.table;

    const featureFlags =
      featureFlagsByEnvironment[environment] ?? featureFlagsByEnvironment.dev;

    const appConfig = new AppConfigConstruct(this, 'AppConfig', {
      developerId,
      environment,
      applicationName: `${serviceName}-appconfig`,
      featureFlags,
    });

    this.appConfigApplicationId = appConfig.application.ref;
    this.appConfigEnvironmentId = appConfig.environment.ref;
    this.appConfigProfileId = appConfig.configurationProfile.ref;

    const apiGateway = new ApiGatewayConstruct(this, 'Api', {
      developerId,
      environment,
      apiName: 'api',
      vpcEndpointIds: vpcEndpointId
        ? [vpcEndpointId, ...consumerVpcEndpointIds]
        : [],
      crossAccountPrincipals,
      kmsKey: kmsConstruct.key,
      cachingEnabled,
    });

    this.api = apiGateway.api;

    new WafConstruct(this, 'waf', {
      developerId,
      environment,
      namePrefix: 'api',
      apiGatewayStageArn: apiGateway.stageArn,
      rateLimiting: { enabled: true, limit: 2000 },
      sqlInjectionRule: { enabled: true, action: 'block' },
      commonRuleSet: { enabled: true, action: 'block' },
      kmsKey: kmsConstruct.key,
    });

    let lambdasList = [];
    for (const route of Object.values(routes)) {
      const lambda = new LambdaApiConstruct(this, route.name, {
        developerId,
        environment,
        functionName: `${route.name}Lambda`,
        sourcePath: `${route.name}Lambda`,
        kmsKey: kmsConstruct.key,
        dbKmsKey: dbKms.key,
        dynamoDBtable: db.table,
        identityDbTable: identityDb.table,
        identityDbActions: route.identityTableActions
          ? route.identityTableActions
          : ['dynamodb:GetItem'],
        dynamoDbActions: route.dynamoDbActions
          ? route.dynamoDbActions
          : ['dynamodb:GetItem'],
        api: apiGateway.api,
        httpMethod: route.method,
        routePath: route.path,
        environmentVariables: {
          STACK: stackPrefix,
          SERVICE_NAME: route.name,
        },
        vpc,
        securityGroups: lambdaSecurityGroup ? [lambdaSecurityGroup] : [],
        cachingEnabled,
      });

      lambdasList.push(lambda.function);
    }

    this.lambdas = lambdasList;

    const IamConsumerConfigs: Record<string, IamConsumerConfig> = {
      test: {
        permissions: ['read', 'write', 'delete'],
        description: 'Internal E2E test consumer {codebuild}',
      },
    };

    const consumerthrottleConfigs: Record<string, ConsumerThrottleConfig> = {
      test: { rateLimit: 50, burstLimit: 100 },
    };

    for (const [consumerName, consumerConfig] of Object.entries(
      externalConsumers,
    )) {
      IamConsumerConfigs[consumerName] = {
        permissions: consumerConfig.permissions,
        accountId: consumerConfig.accountId,
        externalId: consumerConfig.externalId,
        description: consumerConfig.description,
      };

      consumerthrottleConfigs[consumerName] = {
        rateLimit: consumerConfig.rateLimit,
        burstLimit: consumerConfig.burstLimit,
      };
    }

    const iamConsumers = new IamConsumerConstruct(this, 'IamConsumers', {
      developerId,
      environment,
      api: this.api,
      consumers: IamConsumerConfigs,
    });

    const usagePlans = new ConsumerUsagePlanConstruct(this, `UsagePlans`, {
      developerId,
      environment,
      api: this.api,
      consumers: consumerthrottleConfigs,
    });

    this.e2eTestConsumerApiKeyValue = usagePlans.apiKeyValues.get('test');
    this.e2eTestConsumerRole = iamConsumers.consumerRoles.get('test');

    if (Object.keys(externalConsumers).length > 0) {
      const consumerConfig = new ConsumerConfigConstruct(
        this,
        'ConsumerConfig',
        {
          developerId,
          environment,
          region: this.region,
          accountId: this.account,
          consumerRoles: iamConsumers.consumerRoles,
          externalConsumers,
          apiUrl: this.api.url,
          apiKeyValues: usagePlans.apiKeyValues,
        },
      );

      this.e2eTestConsumerSecret = consumerConfig.consumerSecrets.get('flex');
    }

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'Api Endpoint url',
      exportName: `${id}-ApiEndpoint`,
    });

    new CfnOutput(this, 'TableName', {
      value: db.table.tableName,
      description: 'DynamoTableName',
      exportName: `${id}-TableName`,
    });

    new CfnOutput(this, 'IdentityTableName', {
      value: identityDb.table.tableName,
      description: 'Identity DynamoTableName',
      exportName: `${id}-IdentityTableName`,
    });

    new CfnOutput(this, 'AwsRegion', {
      value: this.region,
      description: 'Aws Region',
      exportName: `${id}-AwsRegion`,
    });

    new CfnOutput(this, 'AppConfigApplicationId', {
      value: this.appConfigApplicationId,
      description: 'AppConfig Application ID',
      exportName: `${id}-AppConfigApplicationId`,
    });

    new CfnOutput(this, 'AppConfigEnvironmentId', {
      value: this.appConfigEnvironmentId,
      description: 'AppConfig Environment ID',
      exportName: `${id}-AppConfigEnvironmentId`,
    });

    new CfnOutput(this, 'AppConfigProfileId', {
      value: this.appConfigProfileId,
      description: 'AppConfig Configuration Profile ID',
      exportName: `${id}-AppConfigProfileId`,
    });

    new CfnOutput(this, 'KmsKeyArn', {
      value: this.kmsKey.keyArn,
      description: 'KMS Key ARN',
      exportName: `${id}-kmsKeyArn`,
    });
  }
}
