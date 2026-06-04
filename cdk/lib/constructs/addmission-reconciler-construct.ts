import * as path from 'path';
import { Duration } from 'aws-cdk-lib';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import { Rule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction } from 'aws-cdk-lib/aws-events-targets';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { IKey } from 'aws-cdk-lib/aws-kms';
import { Runtime, Tracing, Code } from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import { LogGroup, RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Trigger } from 'aws-cdk-lib/triggers';
import { getRemovalPolicy } from 'cdk/constants/environment';
import { Construct } from 'constructs';

export interface AdmissionReconcilerConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly api: RestApi;
  readonly ownVpcEndpointId: string;
  readonly consumerParamPath: string;
  readonly kmsKey: IKey;
  readonly logRetentionDays?: RetentionDays;
}

export class AdmissionReconcilerConstruct extends Construct {
  public readonly function: NodejsFunction;

  constructor(
    scope: Construct,
    id: string,
    props: AdmissionReconcilerConstructProps,
  ) {
    super(scope, id);

    const {
      developerId,
      environment,
      api,
      ownVpcEndpointId,
      consumerParamPath,
      kmsKey,
      logRetentionDays = RetentionDays.ONE_YEAR,
    } = props;

    const fullName = developerId
      ? `${developerId}-admission-reconciler-${environment}`
      : `admission-reconciler-${environment}`;

    const logGroup = new LogGroup(this, 'LogGroup', {
      logGroupName: `/aws/lambda/${fullName}`,
      retention: logRetentionDays,
      removalPolicy: getRemovalPolicy(environment),
      encryptionKey: kmsKey,
    });

    this.function = new NodejsFunction(this, 'Function', {
      functionName: fullName,
      runtime: Runtime.NODEJS_20_X,
      handler: 'index.handler',

      code: Code.fromAsset(
        path.resolve(process.cwd(), '..', 'build', 'admissionReconcilerLambda'),
      ),

      timeout: Duration.minutes(2),
      memorySize: 256,
      tracing: Tracing.ACTIVE,
      logGroup,
      reservedConcurrentExecutions: 1,
      environment: {
        REST_API_ID: api.restApiId,
        STAGE_NAME: api.deploymentStage.stageName,
        OWN_VPCE_ID: ownVpcEndpointId,
        OWN_ACCOUNT_ID: api.env.account,
        SSM_CONSUMER_PATH: consumerParamPath,
      },
    });

    this.function.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: ['ssm:GetParametersByPath'],
        resources: [
          `arn:aws:ssm:${api.env.region}:${api.env.account}:parameter${consumerParamPath}`,
          `arn:aws:ssm:${api.env.region}:${api.env.account}:parameter${consumerParamPath}/*`,
        ],
      }),
    );

    this.function.addToRolePolicy(
      new PolicyStatement({
        effect: Effect.ALLOW,
        actions: [
          'apigateway:PATCH',
          'apigateway:POST',
          'apigateway:UpdateRestApiPolicy',
        ],
        resources: [
          `arn:aws:apigateway:${api.env.region}::/restapis/${api.restApiId}`,
          `arn:aws:apigateway:${api.env.region}::/restapis/${api.restApiId}/deployments`,
        ],
      }),
    );

    new Rule(this, 'SsmChangeRule', {
      ruleName: `${fullName}-ssm-change`,
      description: `Reconcile API admission policy on consumer SSM param change`,
      eventPattern: {
        source: ['aws.ssm'],
        detailType: ['Parameter Store Change'],
        detail: {
          name: [{ prefix: `${consumerParamPath}/` }],
          operation: ['Create', 'Update', 'Delete'],
        },
      },
      targets: [new LambdaFunction(this.function)],
    });

    // executeAfter must include `this.function` so the Trigger's custom resource
    // depends on the function's role + DefaultPolicy (a child of the Function
    // construct). Without it, the Trigger can invoke the reconciler before the
    // ssm:GetParametersByPath / apigateway:* policy is attached, which fails the
    // custom resource with "not authorized to perform ssm:GetParametersByPath".
    new Trigger(this, 'DeployReconcile', {
      handler: this.function,
      executeAfter: [api, this.function],
      executeOnHandlerChange: true,
    });
  }
}
