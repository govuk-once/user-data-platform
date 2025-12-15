import { Construct } from 'constructs';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { CfnOutput, Duration, Fn, RemovalPolicy, Stack } from 'aws-cdk-lib';

export interface CoreConfig {
  readonly allowOrigins?: string[];
  readonly allowMethods?: apigatewayv2.CorsHttpMethod[];
  readonly allowHeaders?: string[];
  readonly exposesHeaders?: string[];
  readonly maxAge?: Duration;
  readonly allowCredentials: boolean;
}

export interface ApiGatewayConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly apiName?: string;
  readonly jwtIssuer?: string;
  readonly jwtAudience?: string[];
  readonly corsConfig?: CoreConfig;
  readonly throttlingBurstLimit?: number;
  readonly throttlingRateLimit?: number;
  readonly enableAccessLogs?: boolean;
}

export class ApiGatewayConstruct extends Construct {
  public readonly api: apigatewayv2.HttpApi;
  public readonly authorizer: apigatewayv2.HttpAuthorizer | undefined;
  public readonly stage: apigatewayv2.HttpStage;
  public readonly logGroup?: logs.LogGroup;

  constructor(scope: Construct, id: string, props: ApiGatewayConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      apiName = 'api',
      jwtIssuer,
      jwtAudience,
      corsConfig,
      throttlingBurstLimit = 100,
      throttlingRateLimit = 50,
      enableAccessLogs = true,
    } = props;

    const fullApiName = developerId
      ? `${developerId}-${apiName}-${environment}`
      : `${apiName}-${environment}`;

    if (enableAccessLogs) {
      this.logGroup = new logs.LogGroup(this, 'AccessLogs', {
        logGroupName: `/aws/apigateway/${fullApiName}`,
        retention: logs.RetentionDays.ONE_MONTH,
        removalPolicy: RemovalPolicy.DESTROY,
      });
    }

    this.api = new apigatewayv2.HttpApi(this, 'HttpApi', {
      apiName: fullApiName,
      description: `Http api for ${fullApiName}`,
      createDefaultStage: false,
    });

    if (jwtIssuer && jwtAudience && jwtAudience.length > 0) {
      this.authorizer = new apigatewayv2.HttpAuthorizer(this, 'JwtAuthorizer', {
        httpApi: this.api,
        authorizerName: `${fullApiName}-jwt-authorizer`,
        type: apigatewayv2.HttpAuthorizerType.JWT,
        identitySource: ['$request.header.Authorization'],
        jwtIssuer,
        jwtAudience,
      });
    }

    this.stage = new apigatewayv2.HttpStage(this, 'Stage', {
      httpApi: this.api,
      stageName: environment,
      autoDeploy: true,
      throttle: {
        burstLimit: throttlingBurstLimit,
        rateLimit: throttlingRateLimit,
      },
    });

    new CfnOutput(this, 'ApiEndpoint', {
      value: this.api.apiEndpoint,
      description: 'API Gateway endpoint URL',
    });
  }

  get stageArn(): string {
    const stack = Stack.of(this);
    return Fn.join('', [
      'arn:',
      stack.partition,
      ':apigateway:',
      stack.region,
      '::/apis/',
      this.api.apiId,
      '/stages/',
      this.stage.stageName,
    ]);
  }

  get executeArn(): string {
    return this.api.arnForExecuteApi();
  }
}
