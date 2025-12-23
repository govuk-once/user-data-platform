import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as path from 'path';
import { log } from 'console';

export interface LambdaApiConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly functionName: string;
  readonly handler?: string;
  readonly runtime?: lambda.Runtime;
  readonly timeout?: Duration;
  readonly memorySize?: number;
  readonly sourcePath: string;
  readonly environmentVariables?: Record<string, string>;
  readonly kmsKey?: kms.IKey;
  readonly dynamoDBtable?: dynamodb.Table;
  readonly dynamoDbActions?: string[];
  readonly api?: apigatewayv2.HttpApi;
  readonly authorizer?: apigatewayv2.IHttpRouteAuthorizer;
  readonly httpMethod: apigatewayv2.HttpMethod;
  readonly routePath: string;
  readonly authorizationScopes?: string[];
  readonly logRetentionDays?: logs.RetentionDays;
}

export class LambdaApiConstruct extends Construct {
  public readonly function: lambda.Function;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: LambdaApiConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      functionName,
      handler = 'index.handler',
      runtime = lambda.Runtime.NODEJS_20_X,
      timeout = Duration.seconds(30),
      memorySize = 256,
      sourcePath,
      environmentVariables = {},
      kmsKey,
      dynamoDBtable,
      dynamoDbActions = ['dynamodb:GetItem', 'dynamodb:PuItem'],
      api,
      authorizer,
      httpMethod,
      authorizationScopes,
      logRetentionDays = logs.RetentionDays.ONE_MONTH,
      routePath,
    } = props;

    const fullFunctionName = developerId
      ? `${developerId}-${functionName}-${environment}`
      : `${functionName}-${environment}`;

    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${fullFunctionName}`,
      retention: logRetentionDays,
      removalPolicy: RemovalPolicy.DESTROY,
      encryptionKey: kmsKey,
    });

    const envVars: Record<string, string> = {
      NODE_ENV: environment,
      ...environmentVariables,
    };

    if (dynamoDBtable) {
      envVars['TABLE_NAME'] = dynamoDBtable.tableName;
    }

    if (kmsKey) {
      envVars['KMS_KEY_ID'] = kmsKey.keyId;
    }

    // Sanitize sourcePath to prevent path traversal by using only the basename
    const sanitizedSourcePath = path.basename(sourcePath);
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    const codePath = path.resolve(
      process.cwd(),
      '..',
      'build',
      sanitizedSourcePath,
    );

    this.function = new lambda.Function(this, 'Function', {
      functionName: fullFunctionName,
      runtime,
      handler,
      code: lambda.Code.fromAsset(codePath),
      timeout,
      memorySize,
      environment: envVars,
      environmentEncryption: kmsKey,
      logGroup: this.logGroup,
      tracing: lambda.Tracing.ACTIVE,
    });

    if (dynamoDBtable) {
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          actions: dynamoDbActions,
          resources: [
            dynamoDBtable.tableArn,
            `${dynamoDBtable.tableArn}/index/*`,
          ],
        }),
      );
    }

    if (kmsKey) {
      kmsKey.grantDecrypt(this.function);
      kmsKey.grantEncrypt(this.function);
    }

    if (api) {
      const integration = new HttpLambdaIntegration(
        `${id}Integration`,
        this.function,
      );

      api.addRoutes({
        path: routePath,
        methods: [httpMethod],
        integration,
        authorizer,
        authorizationScopes: authorizer ? authorizationScopes : undefined,
      });
    }
  }
}
