import { App, Aspects } from 'aws-cdk-lib';
import { MainStack, MonitoringStack } from 'cdk/lib/stacks';
import { repoMetaData } from '../constants/environment';
import { VpcStack } from 'cdk/lib/stacks/vpc-stack';
import { CheckovSuppressionAspect } from 'cdk/lib/aspects/checkov-suppression-aspect';
import { E2eStack } from 'cdk/lib/stacks/e2e-stack';

const app = new App();

const environment = app.node.tryGetContext('env') || 'dev';
const developerId = process.env.DEVELOPER_ID || undefined;

const stackPrefix = developerId ? `${developerId}-${environment}` : environment;

const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'eu-west-2';

const awsEnv = account
  ? {
      account,
      region,
    }
  : undefined;

const crossAccountPrincipals: string[] = (() => {
  const ctx = app.node.tryGetContext('crossAccountPrincipals');
  if (!ctx) return [];
  if (Array.isArray(ctx)) return ctx;
  try {
    return JSON.parse(ctx);
  } catch {
    return [];
  }
})();

const skipMainStack = app.node.tryGetContext('skipMainStack') === 'true';

const vpcStack = new VpcStack(app, `${environment}-vpc`, {
  environment,
  env: awsEnv,
  description: `Shared VPC Stack for ${environment} environment`,
});

Aspects.of(app).add(new CheckovSuppressionAspect());

if (!skipMainStack) {
  const mainStack = new MainStack(app, `${stackPrefix}-main`, {
    developerId,
    environment,
    stackPrefix,
    env: awsEnv,
    description: `Main infrastructure stack${developerId ? ` for ${developerId}` : ''}`,
    vpc: vpcStack.vpc,
    lambdaSecurityGroup: vpcStack.lambdaSecurityGroup,
    codebuildSecurityGroup: vpcStack.codeBuildSecurityGroup,
    vpcEndpointId: vpcStack.executeApiEndpointId,
    crossAccountPrincipals,
    availabilityZones: vpcStack.vpc.availabilityZones,
    ...repoMetaData,
  });

  mainStack.addDependency(vpcStack);

  const kmsKeyAlias = `${developerId ? `${developerId}-` : ''}encryption-${environment}`;

  const monitoringStack = new MonitoringStack(
    app,
    `${stackPrefix}-monitoring`,
    {
      developerId,
      environment,
      stackPrefix,
      env: awsEnv,
      description: `Monitoring stack${developerId ? ` for ${developerId}` : ''}`,
      table: mainStack.table,
      api: mainStack.api,
      lambdas: mainStack.lambdas,
      notificationEmails: [],
      kmsKeyAlias,
    },
  );

  monitoringStack.addDependency(mainStack);

  const e2eStack = new E2eStack(app, `${stackPrefix}-e2e`, {
    developerId,
    environment,
    env: awsEnv,
    description: `E2E testing stack${developerId ? ` for ${developerId}` : ''}`,
    vpc: vpcStack.vpc,
    codeBuildSecurityGroup: vpcStack.codeBuildSecurityGroup,
    kmsKeyAlias,
    apiEndpoint: mainStack.api.url,
    e2eTestConsumerRole: mainStack.e2eTestConsumerRole,
    apiId: mainStack.api.restApiId,
    identityTableName: mainStack.identityTable.tableName,
    kmsKeyArn: mainStack.kmsKey.keyArn,
  });

  e2eStack.addDependency(mainStack);
}
app.synth();
