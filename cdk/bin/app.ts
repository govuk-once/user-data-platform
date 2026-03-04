import { App, Aspects } from 'aws-cdk-lib';
import { MainStack, MonitoringStack, SarStack } from 'cdk/lib/stacks';
import { repoMetaData } from '../constants/environment';
import { VpcStack } from 'cdk/lib/stacks/vpc-stack';
import { CheckovSuppressionAspect } from 'cdk/lib/aspects/checkov-suppression-aspect';
import { E2eStack } from 'cdk/lib/stacks/e2e-stack';
import { PerfStack } from 'cdk/lib/stacks/perf-stack';

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

  const sarStack = new SarStack(app, `${stackPrefix}-sar`, {
    developerId,
    environment,
    stackPrefix,
    env: awsEnv,
    description: `DSAR procession stack${developerId ? ` for ${developerId}` : ''}`,
    table: mainStack.table,
    identityTable: mainStack.identityTable,
    kmsKey: mainStack.kmsKey,
    dbKmsKey: mainStack.dbKmsKey,
    dsarQueue: mainStack.dsarQueue,
    vpc: vpcStack.vpc,
    lambdaSecurityGroups: vpcStack.lambdaSecurityGroup,
  });

  sarStack.addDependency(mainStack);

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
      lambdas: [...mainStack.lambdas, ...sarStack.lambdas],
      notificationEmails: [],
      kmsKeyAlias,
    },
  );

  monitoringStack.addDependency(sarStack);

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
    e2eTestConsumerApiKeyValue: mainStack.e2eTestConsumerApiKeyValue,
  });

  e2eStack.addDependency(mainStack);

  const perStack = new PerfStack(app, `${stackPrefix}-perf`, {
    developerId,
    environment,
    env: awsEnv,
    description: `Performance test stack${developerId ? ` for ${developerId}` : ''}`,
    vpc: vpcStack.vpc,
    codeBuildSecurityGroup: vpcStack.codeBuildSecurityGroup,
    apiEndpoint: mainStack.api.url,
    apiId: mainStack.api.restApiId,
    e2eTestConsumerRole: mainStack.e2eTestConsumerRole,
    e2eTestConsumerApiKeyValue: mainStack.e2eTestConsumerApiKeyValue,
    sourceBucketName: e2eStack.sourceBucket.bucketName,
    warningTopic: monitoringStack.warningTopic,
  });

  perStack.addDependency(mainStack);
}
app.synth();
