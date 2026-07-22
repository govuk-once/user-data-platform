import { App, Aspects } from 'aws-cdk-lib';
import {
  BackupStack,
  MainStack,
  MonitoringStack,
  SarStack,
} from 'cdk/lib/stacks';
import { GovUkOnceEnvironments, repoMetaData } from '../constants/environment';
import { VpcStack } from 'cdk/lib/stacks/vpc-stack';
import { CheckovSuppressionAspect } from 'cdk/lib/aspects/checkov-suppression-aspect';
import { E2eStack } from 'cdk/lib/stacks/e2e-stack';
import { MacieStack } from 'cdk/lib/stacks/macie-stack';
import { PerfStack } from 'cdk/lib/stacks/perf-stack';

// App
const app = new App();

// Env
const environment = app.node.tryGetContext('env') || 'dev';
const isDev = environment === GovUkOnceEnvironments.Dev;
const isNotProd = environment !== GovUkOnceEnvironments.Prod;
const isNotDev = environment !== GovUkOnceEnvironments.Dev;
const developerId = process.env.DEVELOPER_ID!;

// AWS Env
const account = process.env.CDK_DEFAULT_ACCOUNT!;
const region = process.env.CDK_DEFAULT_REGION!;
const deploymentRoleArn = process.env.CDK_DEPLOYMENT_ROLE_ARN;
const stackPrefix = developerId ? `${developerId}-${environment}` : environment;
const stackDescription = developerId ? ` for ${developerId}` : '';
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

// Setup
const skipMainStack = app.node.tryGetContext('skipMainStack') === 'true';

// VPC Stack
const vpcStack = new VpcStack(app, `${environment}-vpc`, {
  environment,
  env: awsEnv,
  description: `Shared VPC Stack for ${environment} environment`,
});

// Skip main stack until VPC is deployed
if (!skipMainStack) {
  // Macie stack
  const macieStack = new MacieStack(app, `${stackPrefix}-macie`, {
    env: awsEnv,
    description: `DSAR procession stack ${stackDescription}`,
    isDev,
  });

  // Main stack
  const mainStack = new MainStack(app, `${stackPrefix}-main`, {
    developerId,
    environment,
    stackPrefix,
    env: awsEnv,
    description: `Main infrastructure stack ${stackDescription}`,
    vpc: vpcStack.vpc,
    lambdaSecurityGroup: vpcStack.lambdaSecurityGroup,
    codebuildSecurityGroup: vpcStack.codeBuildSecurityGroup,
    vpcEndpointId: vpcStack.executeApiEndpointId,
    crossAccountPrincipals,
    availabilityZones: vpcStack.vpc.availabilityZones,
    ...repoMetaData,
  });

  mainStack.addDependency(vpcStack);
  mainStack.addDependency(macieStack);
  mainStack.addMacieToKMSResourcePolicy(macieStack.macieSlrArn);

  // SAR stack
  const sarStack = new SarStack(app, `${stackPrefix}-sar`, {
    developerId,
    environment,
    stackPrefix,
    env: awsEnv,
    description: `DSAR procession stack ${stackDescription}`,
    table: mainStack.table,
    identityTable: mainStack.identityTable,
    kmsKey: mainStack.kmsKey,
    dbKmsKey: mainStack.dbKmsKey,
    dsarQueue: mainStack.dsarQueue,
    sarQueue: mainStack.sarQueue,
    vpc: vpcStack.vpc,
    lambdaSecurityGroups: vpcStack.lambdaSecurityGroup,
    deploymentRoleArn,
    enableMacie: true,
    macieSlrArn: macieStack?.macieSlrArn,
  });

  sarStack.addDependency(mainStack);
  sarStack.addDependency(macieStack);

  const kmsKeyPrefix = developerId ? `${developerId}-` : '';
  const kmsKeyAlias = `${kmsKeyPrefix}encryption-${environment}`;

  const monitoringStack = new MonitoringStack(
    app,
    `${stackPrefix}-monitoring`,
    {
      developerId,
      environment,
      stackPrefix,
      env: awsEnv,
      description: `Monitoring stack ${stackDescription}`,
      table: mainStack.table,
      api: mainStack.api,
      lambdas: [...mainStack.lambdas, ...sarStack.lambdas],
      notificationEmails: [],
      kmsKeyAlias,
    },
  );

  monitoringStack.addDependency(sarStack);

  // Testing
  if (isNotProd) {
    const e2eStack = new E2eStack(app, `${stackPrefix}-e2e`, {
      developerId,
      environment,
      env: awsEnv,
      description: `E2E testing stack ${stackDescription}`,
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
      description: `Performance test stack ${stackDescription}`,
      vpc: vpcStack.vpc,
      codeBuildSecurityGroup: vpcStack.codeBuildSecurityGroup,
      apiEndpoint: mainStack.api.url,
      apiId: mainStack.api.restApiId,
      e2eTestConsumerRole: mainStack.e2eTestConsumerRole,
      e2eTestConsumerApiKeyValue: mainStack.e2eTestConsumerApiKeyValue,
      sourceBucketName: e2eStack.sourceBucket.bucketName,
      warningTopic: monitoringStack.warningTopic,
      identityTableName: mainStack.identityTable.tableName,
      dataTableName: mainStack.table.tableName,
    });

    perStack.addDependency(mainStack);
  }
}

// Backup
if (isNotDev) {
  new BackupStack(app, `${stackPrefix}-backup`, {
    developerId,
    environment,
    stackPrefix,
    env: awsEnv,
    description: `Backup infrastructure stack ${stackDescription}`,
  });
}

// Aspects
Aspects.of(app).add(new CheckovSuppressionAspect());

app.synth();
