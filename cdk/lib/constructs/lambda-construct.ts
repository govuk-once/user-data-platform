import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as path from 'path';

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
  readonly api?: apigateway.RestApi;
  readonly authorizer?: apigateway.IAuthorizer;
  readonly httpMethod: string;
  readonly routePath: string;
  readonly logRetentionDays?: logs.RetentionDays;
  readonly vpc?: ec2.IVpc;
  readonly vpcSubnets?: ec2.SubnetSelection;
  readonly securityGroups?: ec2.ISecurityGroup[];
  readonly reservedConcurrentExecutions?: number;
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
      dbKmsKey,
      dynamoDBtable,
      dynamoDbActions = ['dynamodb:GetItem', 'dynamodb:PuItem'],
      api,
      authorizer,
      httpMethod,
      logRetentionDays = logs.RetentionDays.ONE_MONTH,
      routePath,
      vpc,
      vpcSubnets,
      securityGroups,
      reservedConcurrentExecutions = 100,
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

    if (dbKmsKey) {
      envVars['KMS_KEY_ID'] = dbKmsKey.keyId;
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

      vpc,
      vpcSubnets: vpc
        ? (vpcSubnets ?? { subnetType: ec2.SubnetType.PRIVATE_ISOLATED })
        : undefined,
      securityGroups: vpc ? securityGroups : undefined,
      reservedConcurrentExecutions,
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

    if (dbKmsKey) {
      dbKmsKey.grantDecrypt(this.function);
      dbKmsKey.grantEncrypt(this.function);
    }

    if (api) {
      const integration = new apigateway.LambdaIntegration(this.function, {
        proxy: true,
      });

      const pathParts = routePath.split('/').filter((p) => p.length > 0);
      let resource: apigateway.IResource = api.root;

      for (const part of pathParts) {
        const existingResource = resource.getResource(part);
        if (existingResource) {
          resource = existingResource;
        } else {
          resource = resource.addResource(part);
        }
      }

      resource.addMethod(httpMethod, integration, {
        authorizer,
        authorizationType: authorizer
          ? apigateway.AuthorizationType.CUSTOM
          : apigateway.AuthorizationType.NONE,
      });
    }
  }
}
