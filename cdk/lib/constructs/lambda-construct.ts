import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Duration } from 'aws-cdk-lib';
import * as path from 'node:path';
import { getRemovalPolicy } from 'cdk/constants/environment';

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
  readonly dbKmsKey?: kms.IKey;
  readonly dynamoDBtable?: dynamodb.Table;
  readonly dynamoDbActions?: string[];
  readonly identityDbTable?: dynamodb.Table;
  readonly identityDbActions?: string[];
  readonly api?: apigateway.RestApi;
  readonly httpMethod?: string;
  readonly routePath?: string;
  readonly logRetentionDays?: logs.RetentionDays;
  readonly vpc?: ec2.IVpc;
  readonly vpcSubnets?: ec2.SubnetSelection;
  readonly securityGroups?: ec2.ISecurityGroup[];
  readonly reservedConcurrentExecutions?: number;
  readonly cachingEnabled?: boolean;
  readonly sqsQueueUrl?: string;
  readonly sqsQueueArn?: string;
}

export class LambdaApiConstruct extends Construct {
  public readonly function: lambda.Function;
  public readonly logGroup: logs.LogGroup;

  constructor(scope: Construct, id: string, props: LambdaApiConstructProps) {
    super(scope, id);

    const {
      dbKmsKey,
      kmsKey,
      api,
      routePath,
      httpMethod,
      cachingEnabled = false,
    } = props;
    const fullFunctionName = this.getFullFunctionName(props);

    this.logGroup = this.createLogGroup(fullFunctionName, props);
    this.function = this.createLambdaFunction(fullFunctionName, props);
    this.addDynamoDbPolicyToLambda(props);
    this.addIdentityDbPolicyToLambda(props);
    this.addSqsPolicyToLambda(props);

    if (dbKmsKey) {
      dbKmsKey.grantDecrypt(this.function);
      dbKmsKey.grantEncrypt(this.function);
    }

    if (kmsKey) {
      kmsKey.grantDecrypt(this.function);
      kmsKey.grantEncrypt(this.function);
    }

    if (api && routePath && httpMethod) {
      this.configureApiRoute(api, routePath, httpMethod, cachingEnabled);
    }
  }

  private configureApiRoute(
    api: apigateway.RestApi,
    routePath: string,
    httpMethod: string,
    cachingEnabled: boolean,
  ): void {
    const useCacheing = httpMethod === 'GET' && cachingEnabled;
    const pathParts = routePath.split('/').filter((p) => p.length > 0);

    const pathParms = pathParts
      .filter((p) => p.startsWith('{') && p.endsWith('}'))
      .map((p) => p.replace(/[{}+]/g, ''));

    const { cacheKeyParameters, requestParameters } = this.buildCacheParameters(
      useCacheing,
      pathParms,
    );

    const integration = new apigateway.LambdaIntegration(this.function, {
      proxy: true,
      cacheKeyParameters:
        cacheKeyParameters.length > 0 ? cacheKeyParameters : undefined,
    });

    let resource: apigateway.IResource = api.root;
    for (const part of pathParts) {
      resource = resource.getResource(part) ?? resource.addResource(part);
    }

    resource.addMethod(httpMethod, integration, {
      authorizationType: apigateway.AuthorizationType.IAM,
      requestParameters:
        Object.keys(requestParameters).length > 0
          ? requestParameters
          : undefined,
    });
  }

  private buildCacheParameters(
    useCacheing: boolean,
    pathParms: string[],
  ): {
    cacheKeyParameters: string[];
    requestParameters: Record<string, boolean>;
  } {
    const cacheKeyParameters: string[] = [];
    const requestParameters: Record<string, boolean> = {};

    if (!useCacheing) {
      return { cacheKeyParameters, requestParameters };
    }

    const keys = [
      ...pathParms.map((p) => `method.request.path.${p}`),
      `method.request.header.requesting-service`,
      `method.request.header.requesting-service-user-id`,
    ];

    for (const key of keys) {
      cacheKeyParameters.push(key);
      requestParameters[key] = true;
    }

    return { cacheKeyParameters, requestParameters };
  }

  private getFullFunctionName(props: LambdaApiConstructProps): string {
    const { developerId, functionName, environment } = props;

    return developerId
      ? `${developerId}-${functionName}-${environment}`
      : `${functionName}-${environment}`;
  }

  private createLogGroup(
    fullFunctionName: string,
    props: LambdaApiConstructProps,
  ): logs.LogGroup {
    const {
      environment,
      kmsKey,
      logRetentionDays = logs.RetentionDays.ONE_YEAR,
    } = props;

    return new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${fullFunctionName}`,
      retention: logRetentionDays,
      removalPolicy: getRemovalPolicy(environment),
      encryptionKey: kmsKey,
    });
  }

  private createLambdaFunction(
    fullFunctionName: string,
    props: LambdaApiConstructProps,
  ): lambda.Function {
    const {
      handler = 'index.handler',
      runtime = lambda.Runtime.NODEJS_20_X,
      timeout = Duration.seconds(30),
      memorySize = 512,
      kmsKey,
      vpc,
      vpcSubnets,
      securityGroups,
    } = props;

    // Sanitize sourcePath to prevent path traversal by using only the basename
    const sanitizedSourcePath = path.basename(props.sourcePath);
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    const codePath = path.resolve(
      process.cwd(),
      '..',
      'build',
      sanitizedSourcePath,
    );
    const envVars: Record<string, string> =
      this.buildEnvironmentVariables(props);

    return new lambda.Function(this, 'Function', {
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

      vpc,
      vpcSubnets: vpc
        ? (vpcSubnets ?? { subnetType: ec2.SubnetType.PRIVATE_ISOLATED })
        : undefined,
      securityGroups: vpc ? securityGroups : undefined,
      ...(props.environment === 'dev'
        ? {}
        : { reservedConcurrentExecutions: 50 }),
    });
  }

  private buildEnvironmentVariables(
    props: LambdaApiConstructProps,
  ): Record<string, string> {
    const envVars: Record<string, string> = {
      NODE_ENV: props.environment,
      ...(props.environmentVariables ?? {}),
    };
    if (props.dynamoDBtable) {
      envVars['TABLE_NAME'] = props.dynamoDBtable.tableName;
    }

    if (props.identityDbTable) {
      envVars['IDENTITY_TABLE_NAME'] = props.identityDbTable.tableName;
    }

    if (props.dbKmsKey) {
      envVars['KMS_KEY_ID'] = props.dbKmsKey.keyId;
    }

    if (props.sqsQueueUrl) {
      envVars['QUEUE_URL'] = props.sqsQueueUrl;
    }

    return envVars;
  }

  private addDynamoDbPolicyToLambda(props: LambdaApiConstructProps): void {
    const { dynamoDBtable, dynamoDbActions = ['dynamodb:GetItem', 'dynamodb:PuItem'] } = props;

    if (dynamoDBtable && dynamoDbActions.length > 0) {
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
  }

  private addIdentityDbPolicyToLambda(props: LambdaApiConstructProps): void {
    const { identityDbTable, identityDbActions = ['dynamodb:GetItem'] } = props;

    if (identityDbTable && identityDbActions.length > 0) {
      this.function.addToRolePolicy(
        new iam.PolicyStatement({
          actions: identityDbActions,
          resources: [
            identityDbTable.tableArn,
            `${identityDbTable.tableArn}/index/*`,
          ],
        }),
      );
    }
  }

  private addSqsPolicyToLambda(props: LambdaApiConstructProps): void {
    if (!props.sqsQueueArn) {
      return;
    }
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [props.sqsQueueArn],
      }),
    );
  }
}
