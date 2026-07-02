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
import * as sns from 'aws-cdk-lib/aws-sns';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { SlackChannelConfiguration } from 'aws-cdk-lib/aws-chatbot';
import { ManagedPolicy, PolicyStatement } from 'aws-cdk-lib/aws-iam';
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
  getLogRetentionPeriod,
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
  public readonly dbKmsKey: kms.IKey;
  public readonly dsarQueue: sqs.Queue;
  public readonly sarQueue: sqs.Queue;
  public readonly appConfigApplicationId: string;
  public readonly appConfigEnvironmentId: string;
  public readonly appConfigProfileId: string;
  public readonly e2eTestConsumerSecret?: ISecret;
  public readonly e2eTestConsumerRole?: IRole;
  public readonly e2eTestConsumerApiKeyValue?: string;
  public readonly waf: WafConstruct;

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
    } catch {
      console.log(
        'JSON.parse(externalConsumers) error externalConsumers in MainStack',
      );
    }

    const consumerVpcEndpointIds: string[] = Object.values(externalConsumers)
      .map((c) => c.vpcEndpointId)
      .filter((id): id is string => !!id);

    cdk.Tags.of(this).add('ServiceName', serviceName || 'UnknownService');
    cdk.Tags.of(this).add('TeamName', teamName || 'UnknownTeam');
    cdk.Tags.of(this).add('Environment', environment || 'UnknownEnvironment');
    cdk.Tags.of(this).add('Version', version || '0.0.0');

    //Disabling caching temporarily -- need to seek out a better way to invalidate the caches rather than allowing default TTL to run down
    // const cachingEnabled = environment !== GovUkOnceEnvironments.Dev;
    const cachingEnabled = false;

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
    this.dbKmsKey = dbKms.key;

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
      ownVpcEndpointId: vpcEndpointId,
      policyVpcEndpointIds: vpcEndpointId
        ? [vpcEndpointId, ...consumerVpcEndpointIds]
        : [],
      crossAccountPrincipals,
      kmsKey: kmsConstruct.key,
      cachingEnabled,
    });

    this.api = apiGateway.api;

    this.waf = new WafConstruct(this, 'waf', {
      developerId,
      environment,
      namePrefix: 'api',
      apiGatewayStageArn: apiGateway.stageArn,
      rateLimiting: { enabled: true, limit: 300000 },
      sqlInjectionRule: { enabled: true, action: 'block' },
      commonRuleSet: { enabled: true, action: 'block' },
      kmsKey: kmsConstruct.key,
      logRetentionDays: getLogRetentionPeriod(environment),
    });

    const eventQueues = this.createEventQueues(
      developerId,
      environment,
      kmsConstruct.key,
    );

    this.lambdas = this.createLambdaFunctions({
      developerId,
      environment,
      stackPrefix,
      kmsKey: kmsConstruct.key,
      dbKmsKey: dbKms.key,
      db,
      identityDb,
      api: apiGateway.api,
      eventQueues,
      vpc,
      lambdaSecurityGroup,
      cachingEnabled,
    });

    this.dsarQueue = eventQueues.get('dsarQueue')!;
    this.sarQueue = eventQueues.get('sarQueue')!;

    const { IamConsumerConfigs, consumerthrottleConfigs } =
      this.buildConsumerConfigs(externalConsumers);

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

    if (environment === GovUkOnceEnvironments.Dev) {
      const releaseTopic = new sns.Topic(this, 'ReleaseTopic', {
        topicName: 'udp-release-notifications',
        displayName: 'UDP Release Notifications',
        masterKey: this.kmsKey,
      });

      const param = `/${environmentLongNames[environment]}/udp-param/udp/monitoring`;
      const ssmValue = StringParameter.valueFromLookup(this, param, '{}');

      let monitoringConfig: {
        workspaceId?: string;
        channelId?: string;
        pagerDutyUrl?: string;
      } = {};
      try {
        monitoringConfig = JSON.parse(ssmValue);
      } catch {
        console.log(
          'JSON.parse(monitoringConfig) error in MonitoringStack',
        );
      }

      const slackWorkspaceId = monitoringConfig.workspaceId ?? '';

      const releaseChannelId = 'C0B8U7TQ9NJ'; // Test channel ID
      const slack = new SlackChannelConfiguration(this, `ReleaseSlackChannel`, {
        slackChannelConfigurationName: `udp-releases-notification`,
        slackWorkspaceId: slackWorkspaceId,
        slackChannelId: releaseChannelId,
        notificationTopics: [releaseTopic],
        guardrailPolicies: [
          ManagedPolicy.fromAwsManagedPolicyName('ReadOnlyAccess'),
        ],
      });

      slack.role?.addToPrincipalPolicy(
        new PolicyStatement({
          actions: ['kms:Decrypt', 'kms:GenerateDataKey'],
          resources: [this.kmsKey.keyArn],
        }),
      );
    }

    this.createCfnOutputs(id, [
      {
        outputId: 'ApiEndpoint',
        value: this.api.url,
        description: 'Api Endpoint url',
      },
      {
        outputId: 'TableName',
        value: db.table.tableName,
        description: 'DynamoTableName',
      },
      {
        outputId: 'IdentityTableName',
        value: identityDb.table.tableName,
        description: 'Identity DynamoTableName',
      },
      { outputId: 'AwsRegion', value: this.region, description: 'Aws Region' },
      {
        outputId: 'AppConfigApplicationId',
        value: this.appConfigApplicationId,
        description: 'AppConfig Application ID',
      },
      {
        outputId: 'AppConfigEnvironmentId',
        value: this.appConfigEnvironmentId,
        description: 'AppConfig Environment ID',
      },
      {
        outputId: 'AppConfigProfileId',
        value: this.appConfigProfileId,
        description: 'AppConfig Configuration Profile ID',
      },
      {
        outputId: 'KmsKeyArn',
        value: this.kmsKey.keyArn,
        description: 'KMS Key ARN',
      },
    ]);
  }

  private createEventQueues(
    developerId: string | undefined,
    environment: string,
    kmsKey: kms.IKey,
  ): Map<string, sqs.Queue> {
    const eventQueueNames = [
      ...new Set(
        Object.values(routes)
          .map((r) => r.queueName)
          .filter((q): q is string => !!q),
      ),
    ];

    const eventQueues = new Map<string, sqs.Queue>();
    for (const eventQueueName of eventQueueNames) {
      const fullQueueName = developerId
        ? `${developerId}-${eventQueueName}-queue-${environment}`
        : `${eventQueueName}-queue-${environment}`;

      const constructId = `${eventQueueName.replaceAll('-', '')}Queue`;
      const queue = new sqs.Queue(this, constructId, {
        queueName: fullQueueName,
        encryption: sqs.QueueEncryption.KMS,
        encryptionMasterKey: kmsKey,
      });
      eventQueues.set(eventQueueName, queue);
    }
    return eventQueues;
  }

  private createLambdaFunctions(params: {
    developerId: string | undefined;
    environment: string;
    stackPrefix: string;
    kmsKey: kms.IKey;
    dbKmsKey: kms.IKey;
    db: DynamoDBConstruct;
    identityDb: DynamoDBConstruct;
    api: apigateway.RestApi;
    eventQueues: Map<string, sqs.Queue>;
    vpc: ec2.IVpc | undefined;
    lambdaSecurityGroup: ec2.ISecurityGroup | undefined;
    cachingEnabled: boolean;
  }): lambda.Function[] {
    const {
      developerId,
      environment,
      stackPrefix,
      kmsKey,
      dbKmsKey,
      db,
      identityDb,
      api,
      eventQueues,
      vpc,
      lambdaSecurityGroup,
      cachingEnabled,
    } = params;

    const lambdasList = [];
    for (const route of Object.values(routes)) {
      const routeQueue = route.queueName
        ? eventQueues.get(route.queueName)
        : undefined;

      const lambdaConstruct = new LambdaApiConstruct(this, route.name, {
        developerId,
        environment,
        functionName: `${route.name}Lambda`,
        sourcePath: `${route.name}Lambda`,
        kmsKey,
        dbKmsKey,
        dynamoDBtable: db.table,
        identityDbTable: identityDb.table,
        identityDbActions: route.identityTableActions ?? ['dynamodb:GetItem'],
        dynamoDbActions: route.dynamoDbActions ?? ['dynamodb:GetItem'],
        api,
        httpMethod: route.method,
        routePath: route.path,
        environmentVariables: {
          STACK: stackPrefix,
          SERVICE_NAME: route.name,
          POWERTOOLS_SERVICE_NAME: route.name,
        },
        ...(routeQueue
          ? {
              sqsQueueUrl: routeQueue.queueUrl,
              sqsQueueArn: routeQueue.queueArn,
            }
          : {}),
        vpc,
        securityGroups: lambdaSecurityGroup ? [lambdaSecurityGroup] : [],
        cachingEnabled,
        logRetentionDays: getLogRetentionPeriod(environment),
      });

      lambdasList.push(lambdaConstruct.function);
    }
    return lambdasList;
  }

  private buildConsumerConfigs(
    externalConsumers: Record<
      string,
      ExternalConsumerConfig & { vpcEndpointId?: string }
    >,
  ): {
    IamConsumerConfigs: Record<string, IamConsumerConfig>;
    consumerthrottleConfigs: Record<string, ConsumerThrottleConfig>;
  } {
    const IamConsumerConfigs: Record<string, IamConsumerConfig> = {
      test: {
        permissions: ['read', 'write', 'delete'],
        description: 'Internal E2E test consumer {codebuild}',
      },
    };

    const consumerthrottleConfigs: Record<string, ConsumerThrottleConfig> = {
      test: { rateLimit: 500, burstLimit: 1000 },
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

    return { IamConsumerConfigs, consumerthrottleConfigs };
  }

  private createCfnOutputs(
    id: string,
    outputs: { outputId: string; value: string; description: string }[],
  ): void {
    for (const { value, description, outputId } of outputs) {
      new CfnOutput(this, outputId, {
        value,
        description,
        exportName: `${id}-${outputId}`,
      });
    }
  }
}
