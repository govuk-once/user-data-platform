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
import { Checkov } from 'cdk/lib/checkov/checkov';

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
  readonly sqsQueueUrl?: string;
  readonly sqsQueueArn?: string;
  readonly reservedConcurrentExecutions?: number;
  readonly checkovSuppressAWS116?: boolean;
  readonly cachingEnabled?: boolean;
}

interface LambdaApiConstructPropsWithDefaults extends LambdaApiConstructProps {
  reservedConcurrentExecutions: number;
  checkovSuppressAWS116: boolean;
  cachingEnabled: boolean;
  fullFunctionName: string;
}

export class LambdaApiConstruct extends Construct {
  public function!: lambda.Function;
  private logGroup!: logs.LogGroup;
  private props!: LambdaApiConstructPropsWithDefaults;

  constructor(scope: Construct, id: string, props: LambdaApiConstructProps) {
    super(scope, id);

    // Build class instance props
    this.applyPropDefaults(props);

    // Build Lambda
    this.createLogGroup();
    this.createLambdaFunction();

    // Ensure all core entitities have been initialised
    if (!this.props || !this.logGroup || !this.function) {
      throw new Error('Failed to create props, logGroup or lambda');
    }

    // Apply DynamoDB / Identity Policy / SQS
    this.applyDynamoDbPolicyToLambda();
    this.applyIdentityDbPolicyToLambda();
    this.applySqsPolicyToLambda();

    // DB KMS Encrypt / Decrypt
    this.applyDBKMSEncryptDecrypt();

    // KMS Encrypt / Decrypt
    this.applyKMSEncryptDecrypt();

    // Configure API route
    this.configureApiRoute();

    // Apply Checkov supressions
    this.applyCheckovSuppressions();
  }

  private applyPropDefaults(props: LambdaApiConstructProps): void {
    this.props = {
      ...props,
      fullFunctionName: props.developerId
        ? `${props.developerId}-${props.functionName}-${props.environment}`
        : `${props.functionName}-${props.environment}`,
      cachingEnabled: props.cachingEnabled ?? false,
      checkovSuppressAWS116: props.checkovSuppressAWS116 ?? true,
      reservedConcurrentExecutions: props.environment === 'dev' ? 2 : 50,
    };
  }

  private applyDBKMSEncryptDecrypt(): void {
    const { dbKmsKey } = this.props;

    if (dbKmsKey) {
      dbKmsKey.grantDecrypt(this.function);
      dbKmsKey.grantEncrypt(this.function);
    }
  }

  private applyKMSEncryptDecrypt(): void {
    const { kmsKey } = this.props;

    if (kmsKey) {
      kmsKey.grantDecrypt(this.function);
      kmsKey.grantEncrypt(this.function);
    }
  }

  private applyCheckovSuppressions(): void {
    if (this.props.checkovSuppressAWS116) {
      Checkov.suppressAWS116(this.function);
    }
  }

  private configureApiRoute(): void {
    const { api, routePath, httpMethod, cachingEnabled } = this.props;

    if (!api || !routePath || !httpMethod) {
      return;
    }

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

  private createLogGroup(): void {
    const {
      environment,
      kmsKey,
      logRetentionDays = logs.RetentionDays.ONE_YEAR,
    } = this.props;

    this.logGroup = new logs.LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${this.props.fullFunctionName}`,
      retention: logRetentionDays,
      removalPolicy: getRemovalPolicy(environment),
      encryptionKey: kmsKey,
    });
  }

  private createLambdaFunction(): void {
    const {
      handler = 'index.handler',
      runtime = lambda.Runtime.NODEJS_24_X,
      timeout = Duration.seconds(30),
      memorySize = 512,
      kmsKey,
      vpc,
      vpcSubnets,
      securityGroups,
      reservedConcurrentExecutions,
    } = this.props;

    // Sanitize sourcePath to prevent path traversal by using only the basename
    const sanitizedSourcePath = path.basename(this.props.sourcePath);
    // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
    const codePath = path.resolve(
      process.cwd(),
      '..',
      'build',
      sanitizedSourcePath,
    );
    const envVars: Record<string, string> = this.buildEnvironmentVariables(
      this.props,
    );

    this.function = new lambda.Function(this, 'Function', {
      functionName: this.props.fullFunctionName,
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
      reservedConcurrentExecutions,
    });
  }

  private buildEnvironmentVariables(
    props: LambdaApiConstructProps,
  ): Record<string, string> {
    const { environment, environmentVariables = {} } = props;

    const envVars: Record<string, string> = {
      NODE_ENV: environment,
      ...environmentVariables,
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

  private applyDynamoDbPolicyToLambda(): void {
    const {
      dynamoDBtable,
      dynamoDbActions = ['dynamodb:GetItem', 'dynamodb:PuItem'],
    } = this.props;

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

  private applyIdentityDbPolicyToLambda(): void {
    const { identityDbTable, identityDbActions = ['dynamodb:GetItem'] } =
      this.props;

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

  private applySqsPolicyToLambda(): void {
    if (!this.props.sqsQueueArn) {
      return;
    }
    this.function.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sqs:SendMessage'],
        resources: [this.props.sqsQueueArn],
      }),
    );
  }
}
