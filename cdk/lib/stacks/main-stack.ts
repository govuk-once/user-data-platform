import { CfnOutput, Stack, StackProps } from 'aws-cdk-lib';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  CognitoConstruct,
  M2MClientConfig,
} from '../constructs/cognito-construct';
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
import { LambdaAuthorizerConstuct } from '../constructs/lambda-authorizer-construct';
import { UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import {
  ConsumerConfigConstruct,
  ExternalConsumerConfig,
} from '../constructs/consumer-config-construct';
import { ISecret } from 'aws-cdk-lib/aws-secretsmanager';

export interface MainStackProps extends StackProps {
  developerId?: string;
  environment: string;
  m2mClients?: Record<string, M2MClientConfig>;
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
  privateLinkServiceName?: string;
  availabilityZones?: string[];
  externalConsumers?: Record<string, ExternalConsumerConfig>;
}

export class MainStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly api: apigateway.RestApi;
  public readonly lambdas: lambda.Function[];
  public readonly kmsKey: kms.IKey;
  public readonly cognitoClient: UserPoolClient;
  public readonly cognitoDomain: string;
  public readonly cognitoEndpoint: string;
  public readonly appConfigApplicationId: string;
  public readonly appConfigEnvironmentId: string;
  public readonly appConfigProfileId: string;
  public readonly e2eTestConsumerSecret?: ISecret;

  constructor(scope: Construct, id: string, props: MainStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      serviceName,
      teamName,
      version,
      m2mClients = {
        flex: {
          scopes: ['udp/read', 'udp/write', 'udp/delete'],
          accessTokenValidityMinutes: 60,
        },
      },
      stackPrefix,
      vpcEndpointId,
      crossAccountPrincipals = [],
      vpc,
      lambdaSecurityGroup,
      codebuildSecurityGroup,
      privateLinkServiceName,
      availabilityZones = [],
      externalConsumers = {},
    } = props;

    cdk.Tags.of(this).add('ServiceName', serviceName || 'UnknownService');
    cdk.Tags.of(this).add('TeamName', teamName || 'UnknownTeam');
    cdk.Tags.of(this).add('Environment', environment || 'UnknownEnvironment');
    cdk.Tags.of(this).add('Version', version || '0.0.0');

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
      tableName: 'user-data-store',
      kmsKey: kmsConstruct.key,
      localSecondaryIndexes: [
        {
          indexName: 'lsi-index',
          sortKeyName: 'lsi',
        },
      ],
      ttlAttributeName: 'ttl',
    });

    this.table = db.table;

    const cognito = new CognitoConstruct(this, 'Cognito', {
      developerId,
      environment,
      m2mClients,
    });

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

    const client = cognito.m2mClients.get('flex');
    if (!client) {
      throw new Error('Flex m2m client not found required for e2e tests');
    }
    this.cognitoClient = client;
    this.cognitoDomain = `${cognito.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`;
    this.cognitoEndpoint = cognito.tokenEndpoint;

    const apiGateway = new ApiGatewayConstruct(this, 'Api', {
      developerId,
      environment,
      apiName: 'api',
      vpcEndpointIds: vpcEndpointId ? [vpcEndpointId] : [],
      crossAccountPrincipals,
      kmsKey: kmsConstruct.key,
      cachingEnabled: environment !== 'dev' ? true : false,
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

    const authorizer = new LambdaAuthorizerConstuct(this, 'Authorizer', {
      developerId,
      environment,
      cognitoIssuer: cognito.issuerUrl,
      resourceServerIdentifier: 'udp',
      vpc,
      securityGroups: codebuildSecurityGroup ? [codebuildSecurityGroup] : [],
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
        dynamoDbActions: route.dynamoDbActions ? route.dynamoDbActions : [],
        api: apiGateway.api,
        authorizer: authorizer.authorizer,
        httpMethod: route.method,
        routePath: route.path,
        environmentVariables: {
          STACK: stackPrefix,
          SERVICE_NAME: route.name,
        },
        vpc,
        securityGroups: lambdaSecurityGroup ? [lambdaSecurityGroup] : [],
      });

      lambdasList.push(lambda.function);
    }

    this.lambdas = lambdasList;

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'Api Endpoint url',
      exportName: `${id}-ApiEndpoint`,
    });

    new CfnOutput(this, 'UserPoolId', {
      value: cognito.userPool.userPoolId,
      description: 'Cogntio user pool id',
      exportName: `${id}-UserPoolId`,
    });

    new CfnOutput(this, 'TokenEndpoint', {
      value: cognito.tokenEndpoint,
      description: 'oAuth2 Token Endpoint',
      exportName: `${id}-TokenEndpoint`,
    });

    new CfnOutput(this, 'CognitoDomain', {
      value: `${cognito.userPoolDomain.domainName}.auth.${this.region}.amazoncognito.com`,
      description: 'Cognito Domain for oAuth2',
      exportName: `${id}-CognitoDomain`,
    });

    new CfnOutput(this, 'TableName', {
      value: db.table.tableName,
      description: 'DynamoTableName',
      exportName: `${id}-TableName`,
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

    for (const [clientName, client] of cognito.m2mClients) {
      new CfnOutput(this, `M2MClientId-${clientName}`, {
        value: client.userPoolClientId,
        description: `M2M Client ID for ${clientName}`,
        exportName: `${id}-M2MClientId-${clientName}`,
      });
    }

    if (Object.keys(externalConsumers).length > 0) {
      const consumerConfig = new ConsumerConfigConstruct(
        this,
        'ConsumerConfig',
        {
          developerId,
          environment,
          region: this.region,
          accountId: this.account,
          privateLinkServiceName,
          availabilityZones,
          cognitoTokenEndpoint: cognito.tokenEndpoint,
          cognitoUserPoolId: cognito.userPool.userPoolId,
          m2mClients: cognito.m2mClients,
          externalConsumers,
          apiUrl: this.api.url,
        },
      );

      this.e2eTestConsumerSecret = consumerConfig.consumerSecrets.get('flex');
    }
  }
}
