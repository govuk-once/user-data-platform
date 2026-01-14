import { Construct } from 'constructs';
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as kms from 'aws-cdk-lib/aws-kms';

export interface MonitorStackProps extends StackProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly table: dynamodb.ITable;
  readonly api: apigateway.RestApi;
  readonly lambdas: lambda.IFunction[];
  readonly notificationEmails?: string[];
  readonly stackPrefix: string;
  readonly kmsKey: kms.IKey;
}

export class MonitoringStack extends Stack {
  public readonly alarmTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly xrayTraceGroup?: xray.CfnGroup;

  constructor(scope: Construct, id: string, props: MonitorStackProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      table,
      api,
      lambdas,
      notificationEmails = [],
      stackPrefix,
      kmsKey,
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    this.alarmTopic = new sns.Topic(this, 'AlarmTopic', {
      topicName: `${resourcePrefix}-alarms`,
      displayName: `${resourcePrefix} Infrastructure Alarms`,
      masterKey: kmsKey,
    });

    this.xrayTraceGroup = new xray.CfnGroup(this, developerId || environment, {
      groupName: stackPrefix,
      filterExpression: `annotation[stack] = "${stackPrefix}"`,
      insightsConfiguration: {
        insightsEnabled: true,
        notificationsEnabled: true,
      },
    });

    for (const email of notificationEmails) {
      new sns.Subscription(
        this,
        `Email-${email.replace(/[^a-zA-Z0-9]/g, '')}`,
        {
          topic: this.alarmTopic,
          protocol: sns.SubscriptionProtocol.EMAIL,
          endpoint: email,
        },
      );
    }

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `${resourcePrefix}-dashboard`,
    });

    this.createDyanamoDBAlarms(table, resourcePrefix);
    this.addDynamoDBWidgets(table);

    this.createApiGatewayAlarms(api, environment, resourcePrefix);
    this.addApiGatewayWidgets(api, environment);

    lambdas.forEach((fn, index) => {
      this.createLambdaAlarms(fn, resourcePrefix, index);
    });
    this.addLambdaWidgets(lambdas);
  }

  private createDyanamoDBAlarms(
    table: dynamodb.ITable,
    resourcePrefix: string,
  ) {
    new cloudwatch.Alarm(this, 'DyanamoDbReadThrottled', {
      alarmName: `${resourcePrefix}-dynamodb-read-throttled`,
      alarmDescription: 'Dynamodb read requests are being throttled',
      metric: table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY],
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    new cloudwatch.Alarm(this, 'DyanamoDbWriteThrottled', {
      alarmName: `${resourcePrefix}-dynamodb-write-throttled`,
      alarmDescription: 'Dynamodb write requests are being throttled',
      metric: table.metricThrottledRequestsForOperations({
        operations: [
          dynamodb.Operation.PUT_ITEM,
          dynamodb.Operation.UPDATE_ITEM,
        ],
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    new cloudwatch.Alarm(this, 'DyanamoDbSystemErrors', {
      alarmName: `${resourcePrefix}-dynamodb-system-errors`,
      alarmDescription: 'Dynamodb system errors detected',
      metric: table.metricSystemErrorsForOperations({
        operations: [
          dynamodb.Operation.GET_ITEM,
          dynamodb.Operation.PUT_ITEM,
          dynamodb.Operation.QUERY,
        ],
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });
  }

  private addDynamoDBWidgets(table: dynamodb.ITable): void {
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Dynamo - Read/Write Capacity',
        left: [
          table.metricConsumedReadCapacityUnits({
            period: Duration.minutes(1),
          }),
          table.metricConsumedWriteCapacityUnits({
            period: Duration.minutes(1),
          }),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Dynamo - Latency',
        left: [
          table.metricSuccessfulRequestLatency({
            dimensionsMap: { TableName: table.tableName, Operation: 'GetItem' },
            period: Duration.minutes(1),
            statistic: 'Average',
          }),
          table.metricSuccessfulRequestLatency({
            dimensionsMap: { TableName: table.tableName, Operation: 'PutItem' },
            period: Duration.minutes(1),
            statistic: 'Average',
          }),
        ],
        width: 12,
      }),
    );
  }

  private createApiGatewayAlarms(
    api: apigateway.RestApi,
    stage: string,
    resourcePrefix: string,
  ): void {
    const apiMetric = (metricName: string, statistic = 'Sum') =>
      new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName,
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: stage,
        },
        period: Duration.minutes(1),
        statistic,
      });

    new cloudwatch.Alarm(this, 'ApiGateway5xxErrors', {
      alarmName: `${resourcePrefix}-api-5xx-errors`,
      alarmDescription: 'API Gateway 5xx error rate is high',
      metric: apiMetric('5xxError'),
      threshold: 10,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    new cloudwatch.Alarm(this, 'ApiGateway4xxErrors', {
      alarmName: `${resourcePrefix}-api-4xx-errors`,
      alarmDescription: 'API Gateway 4xx error rate is high',
      metric: apiMetric('4xxError'),
      threshold: 50,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    new cloudwatch.Alarm(this, 'ApiGatewayLatency', {
      alarmName: `${resourcePrefix}-api-latency`,
      alarmDescription: 'API Gateway p99 latency is high',
      metric: apiMetric('Latency', 'p99'),
      threshold: 5000,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });
  }

  private addApiGatewayWidgets(api: apigateway.RestApi, stage: string): void {
    const apiMetric = (metricName: string, statistic = 'Sum') =>
      new cloudwatch.Metric({
        namespace: 'AWS/ApiGateway',
        metricName,
        dimensionsMap: {
          ApiName: api.restApiName,
          Stage: stage,
        },
        period: Duration.minutes(1),
        statistic,
      });

    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Api Gateway - Requests & Errors',
        left: [
          apiMetric('Count'),
          apiMetric('4xxError'),
          apiMetric('5xxError'),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Api Gateway - Latency',
        left: [
          apiMetric('Latency', 'Average'),
          apiMetric('Latency', 'p99'),
          apiMetric('IntegrationLatency', 'Average'),
        ],
        width: 12,
      }),
    );
  }

  private createLambdaAlarms(
    fn: lambda.IFunction,
    resourcePrefix: string,
    index: number,
  ): void {
    const id = `Lambda${index}`;

    new cloudwatch.Alarm(this, `${id}Errors`, {
      alarmName: `${resourcePrefix}-lambda-${index}-errors`,
      alarmDescription: 'Lambda Errors',
      metric: fn.metricErrors({ period: Duration.minutes(1) }),
      threshold: 5,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    new cloudwatch.Alarm(this, `${id}Duration`, {
      alarmName: `${resourcePrefix}-lambda-${index}-duration`,
      alarmDescription: 'Lambda duration is high',
      metric: fn.metricDuration({
        period: Duration.minutes(1),
        statistic: 'p99',
      }),
      threshold: 25000,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });

    new cloudwatch.Alarm(this, `${id}Throttles`, {
      alarmName: `${resourcePrefix}-lambda-${index}-throttles`,
      alarmDescription: 'Lambda is being throttled',
      metric: fn.metricThrottles({
        period: Duration.minutes(1),
        statistic: 'p99',
      }),
      threshold: 25000,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    }).addAlarmAction({
      bind: () => ({ alarmActionArn: this.alarmTopic.topicArn }),
    });
  }

  private addLambdaWidgets(lambdas: lambda.IFunction[]): void {
    lambdas.forEach((fn, index) => {
      this.dashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: `Lambda ${index}`,
          left: [
            fn.metricInvocations({ period: Duration.minutes(1) }),
            fn.metricErrors({ period: Duration.minutes(1) }),
            fn.metricThrottles({ period: Duration.minutes(1) }),
          ],
          right: [
            fn.metricDuration({
              period: Duration.minutes(1),
              statistic: 'Average',
            }),
          ],
          width: 12,
        }),
      );
    });
  }
}
