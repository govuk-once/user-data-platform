import { Duration, RemovalPolicy } from 'aws-cdk-lib';
import {
  IAuthorizer,
  IdentitySource,
  TokenAuthorizer,
} from 'aws-cdk-lib/aws-apigateway';
import {
  ISecurityGroup,
  IVpc,
  SubnetSelection,
  SubnetType,
} from 'aws-cdk-lib/aws-ec2';
import { Code, Function, Runtime } from 'aws-cdk-lib/aws-lambda';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';
import * as path from 'path';

export interface LambdaAuthorizerConstuctProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly cognitoIssuer: string;
  readonly resourceServerIdentifier?: string;
  readonly cacheTtl?: Duration;
  readonly logRetentionDays?: RetentionDays;
  readonly vpc?: IVpc;
  readonly vpcSubnets?: SubnetSelection;
  readonly securityGroups?: ISecurityGroup[];
}

export class LambdaAuthorizerConstuct extends Construct {
  public readonly function: Function;
  public readonly authorizer: IAuthorizer;
  public readonly logGroup: LogGroup;

  constructor(
    scope: Construct,
    id: string,
    props: LambdaAuthorizerConstuctProps,
  ) {
    super(scope, id);

    const {
      developerId,
      environment,
      cognitoIssuer,
      resourceServerIdentifier = 'api',
      cacheTtl = Duration.minutes(5),
      logRetentionDays = RetentionDays.ONE_MONTH,
      vpc,
      vpcSubnets,
      securityGroups,
    } = props;

    const fullFunctionName = developerId
      ? `${developerId}-authorizer-${environment}`
      : `authorizer-${environment}`;

    this.logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${fullFunctionName}`,
      retention: logRetentionDays,
      removalPolicy: RemovalPolicy.DESTROY,
    });

    const envVars: Record<string, string> = {
      NODE_ENV: environment,
      COGNITO_ISSUER: cognitoIssuer,
      RESOURCE_SERVER_ID: resourceServerIdentifier,
    };

    const codePath = path.resolve(
      process.cwd(),
      '..',
      'build',
      'authorizationLambda',
    );

    this.function = new Function(this, 'Funtion', {
      functionName: fullFunctionName,
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: Code.fromAsset(codePath),
      timeout: Duration.seconds(10),
      memorySize: 256,
      environment: envVars,
      logGroup: this.logGroup,
      vpc,
      vpcSubnets: vpc
        ? (vpcSubnets ?? { subnetType: SubnetType.PRIVATE_ISOLATED })
        : undefined,
      securityGroups: vpc ? securityGroups : undefined,
    });

    this.authorizer = new TokenAuthorizer(this, 'TokenAuthorizer', {
      authorizerName: `${fullFunctionName}-authorizer`,
      handler: this.function,
      identitySource: IdentitySource.header('Authorization'),
      resultsCacheTtl: cacheTtl,
    });
  }
}
