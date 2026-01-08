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
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { LambdaApiConstruct } from '../constructs/lambda-construct';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { WafConstruct } from '../constructs/waf-construct';
import { routes } from '@libs/utils';

export interface MainStackProps extends StackProps {
  developerId?: string;
  environment: string;
  m2mClients?: Record<string, M2MClientConfig>;
  serviceName: string;
  teamName: string;
  repositoryUrl: string;
  version: string;
  stackPrefix: string;
}

export class MainStack extends Stack {
  public readonly table: dynamodb.Table;
  public readonly api: apigatewayv2.HttpApi;
  public readonly lambdas: lambda.Function[];

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
    } = props;

    cdk.Tags.of(this).add('ServiceName', serviceName || 'UnknownService');
    cdk.Tags.of(this).add('TeamName', teamName || 'UnknownTeam');
    cdk.Tags.of(this).add('Environment', environment || 'UnknownEnvironment');
    cdk.Tags.of(this).add('Version', version || '0.0.0');

    const kms = new KmsConstruct(this, 'Kms', {
      developerId,
      environment,
      namePrefix: 'encryption',
    });

    const db = new DynamoDBConstruct(this, 'DynamoDb', {
      developerId,
      environment,
      tableName: 'user-data-store',
      kmsKey: kms.key,
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

    const apiGateway = new ApiGatewayConstruct(this, 'Api', {
      developerId,
      environment,
      jwtIssuer: cognito.issuerUrl,
      jwtAudience: Array.from(cognito.m2mClients.values()).map(
        (c) => c.userPoolClientId,
      ),
    });

    this.api = apiGateway.api;

    // new WafConstruct(this, 'waf', {
    //   developerId,
    //   environment,
    //   apiGatewayStageArn: apiGateway.stageArn,
    // });

    const jwtAuthorizer = new HttpJwtAuthorizer(
      'JwtAuthorizer',
      cognito.issuerUrl,
      {
        jwtAudience: Array.from(cognito.m2mClients.values()).map(
          (c) => c.userPoolClientId,
        ),
      },
    );

    let lambdasList = [];
    for (const route of Object.values(routes)) {
      const lambda = new LambdaApiConstruct(this, route.name, {
        developerId,
        environment,
        environmentVariables: routes.environmentVariables
          ? {
              ...routes.environmentVariables,
              STACK: stackPrefix,
              SERVICE_NAME: route.name,
            }
          : {
              STACK: stackPrefix,
              SERVICE_NAME: route.name,
            },
        functionName: `${route.name}Lambda`,
        sourcePath: `${route.name}Lambda`,
        kmsKey: kms.key,
        dynamoDBtable: db.table,
        dynamoDbActions: route.dynamoDbActions ? route.dynamoDbActions : [],
        api: apiGateway.api,
        authorizer: jwtAuthorizer,
        httpMethod: route.method as apigatewayv2.HttpMethod,
        routePath: route.path,
        authorizationScopes: route.authorizationScopes
          ? route.authorizationScopes
          : [],
      });

      lambdasList.push(lambda.function);
    }

    this.lambdas = lambdasList;

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.api.apiEndpoint,
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

    for (const [clientName, client] of cognito.m2mClients) {
      new CfnOutput(this, `M2MClientId-${clientName}`, {
        value: client.userPoolClientId,
        description: `M2M Client ID for ${clientName}`,
        exportName: `${id}-M2MClientId-${clientName}`,
      });
    }
  }
}
