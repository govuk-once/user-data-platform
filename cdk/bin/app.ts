import { App, Aspects } from 'aws-cdk-lib';
import { MainStack, MonitoringStack } from 'cdk/lib/stacks';
import { repoMetaData } from '../constants/environment';

const app = new App();

const environment = app.node.tryGetContext('env') || 'dev';
const developerId = process.env.DEVELOPER_ID || undefined;

const stackPrefix = developerId ? `${developerId}-${environment}` : environment;

const account = process.env.CDK_DEFULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION || 'eu-west-2';

const awsEnv = account
  ? {
      account,
      region,
    }
  : undefined;

const mainStack = new MainStack(app, `${stackPrefix}-main`, {
  developerId,
  environment,
  env: awsEnv,
  description: `Main infrastructure stack${developerId ? ` for ${developerId}` : ''}`,
  m2mClients: {
    flex: {
      scopes: ['udp/read', 'udp/write'],
      accessTokenValidityMinutes: 60,
    },
  },
  ...repoMetaData,
});

const monitoringStack = new MonitoringStack(app, `${stackPrefix}-monitoring`, {
  developerId,
  environment,
  env: awsEnv,
  description: `Monitoring stack${developerId ? ` for ${developerId}` : ''}`,
  table: mainStack.table,
  api: mainStack.api,
  lambdas: mainStack.lambdas,
  notificationEmails: [],
});

monitoringStack.addDependency(mainStack);

app.synth();
