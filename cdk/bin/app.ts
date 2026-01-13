import { App } from 'aws-cdk-lib';
import { MainStack, MonitoringStack } from 'cdk/lib/stacks';
import { repoMetaData } from '../constants/environment';
import { VpcStack } from 'cdk/lib/stacks/vpc-stack';

const app = new App();

const environment = app.node.tryGetContext('env') || 'dev';
const developerId = process.env.DEVELOPER_ID || undefined;

const stackPrefix = developerId ? `${developerId}-${environment}` : environment;

const account = developerId ? null : process.env.CDK_DEFAULT_ACCOUNT;
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

if (!skipMainStack) {
  const mainStack = new MainStack(app, `${stackPrefix}-main`, {
    developerId,
    environment,
    stackPrefix,
    env: awsEnv,
    description: `Main infrastructure stack${developerId ? ` for ${developerId}` : ''}`,
    vpc: vpcStack.vpc,
    lambdaSecurityGroup: vpcStack.lambdaSecurityGroup,
    vpcEndpointId: vpcStack.executeApiEndpointId,
    crossAccountPrincipals,

    m2mClients: {
      flex: {
        scopes: ['udp/read', 'udp/write', 'udp/delete'],
        accessTokenValidityMinutes: 60,
      },
    },
    ...repoMetaData,
  });

  mainStack.addDependency(vpcStack);

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
      kmsKey: mainStack.kmsKey,
    },
  );

  monitoringStack.addDependency(mainStack);
}
app.synth();
