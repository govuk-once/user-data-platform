import * as fs from 'node:fs';
import * as path from 'node:path';
import { Construct } from 'constructs';
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as sns from 'aws-cdk-lib/aws-sns';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as xray from 'aws-cdk-lib/aws-xray';
import * as kms from 'aws-cdk-lib/aws-kms';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { GovUkOnceEnvironments } from 'cdk/constants/environment';
import { NFR } from 'cdk/constants/nfr';
import { SLO_MIN_REQUESTS } from 'cdk/constants/slo';
import { routes } from '@libs/utils';
import { AlarmRouting, AlarmSeverity } from '../constructs/alarm-routing';
import { CriticalAlarms } from '../constructs/critical-alarms-construct';
import { MonitoringInventory } from '../utils/discover-monitored-resources';
import { GovUKTag } from '@govuk-connect/tag';

export interface MonitorStackProps extends StackProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly notificationEmails?: string[];
  readonly stackPrefix: string;
}

const mapEnvironments = {
  [GovUkOnceEnvironments.Dev]: 'development',
  [GovUkOnceEnvironments.Stag]: 'staging',
  [GovUkOnceEnvironments.Prod]: 'production',
};

export class MonitoringStack extends Stack {
  public readonly criticalTopic: sns.Topic;
  public readonly warningTopic: sns.Topic;
  public readonly dashboard: cloudwatch.Dashboard;
  public readonly performanceDashboard: cloudwatch.Dashboard;
  public readonly xrayTraceGroup?: xray.CfnGroup;
  public readonly criticalAlarms: CriticalAlarms;
  private readonly routing: AlarmRouting;

  constructor(scope: Construct, id: string, props: MonitorStackProps) {
    super(scope, id, props);

    const {
      developerId,
      environment,
      notificationEmails = [],
      stackPrefix,
    } = props;

    const inventory = this.loadMonitoringInventory();

    const tables = inventory.tableNames.map((name) =>
      dynamodb.Table.fromTableName(this, `MonitoredTable-${name}`, name),
    );

    const lambdas = inventory.lambdaNames.map((name) =>
      lambda.Function.fromFunctionName(this, `MonitoredLambda-${name}`, name),
    );

    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    const apiName = developerId
      ? `${developerId}-api-${environment}`
      : `api-${environment}`;

    const kmsKeyPrefix = developerId ? `${developerId}-` : '';
    const kmsKeyAlias = `${kmsKeyPrefix}encryption-${environment}`;
    const kmsKey = kms.Alias.fromAliasName(
      this,
      'EncryptionKey',
      `alias/${kmsKeyAlias}`,
    );

    this.criticalTopic = new sns.Topic(this, 'CriticalTopic', {
      topicName: `${resourcePrefix}-critical-alarms`,
      displayName: `${resourcePrefix} Critical Alerts`,
      masterKey: kmsKey,
    });
    GovUKTag.of(this.criticalTopic)
      .PII.TRUE()
      .DataClassification.OFFICIAL_SENSITIVE()
      .Exposure.INTERNET_FACING();

    this.warningTopic = new sns.Topic(this, 'WarningTopic', {
      topicName: `${resourcePrefix}-warning-alarms`,
      displayName: `${resourcePrefix} Warning Alerts`,
      masterKey: kmsKey,
    });
    GovUKTag.of(this.warningTopic)
      .PII.TRUE()
      .DataClassification.OFFICIAL_SENSITIVE()
      .Exposure.INTERNET_FACING();

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
          topic: this.criticalTopic,
          protocol: sns.SubscriptionProtocol.EMAIL,
          endpoint: email,
        },
      );
    }

    if (!developerId) {
      const param = `/${mapEnvironments[environment as GovUkOnceEnvironments]}/udp-param/udp/monitoring`;
      const ssmValue = StringParameter.valueFromLookup(this, param, '{}');

      // Slack delivery is handled by the platform notifications hub (see
      // AlarmRouting); this parameter now only carries the PagerDuty URL.
      let monitoringConfig: { pagerDutyUrl?: string } = {};
      try {
        monitoringConfig = JSON.parse(ssmValue);
      } catch {
        console.log(
          'JSON.parse(monitoringConfig) error externalConsumers in MonitoringStack',
        );
      }

      if (monitoringConfig.pagerDutyUrl) {
        new sns.Subscription(this, 'PagerDutySubscription', {
          topic: this.criticalTopic,
          protocol: sns.SubscriptionProtocol.HTTPS,
          endpoint: monitoringConfig.pagerDutyUrl,
        });
      }
    }

    this.routing = new AlarmRouting(this, 'AlarmRouting', {
      environment,
      developerId,
      criticalTopic: this.criticalTopic,
      warningTopic: this.warningTopic,
    });

    this.criticalAlarms = new CriticalAlarms(this, 'CriticalAlarms', {
      routing: this.routing,
      resourcePrefix,
      stackPrefix,
      developerId,
      environment,
      apiAccessLogGroupName: `/aws/apigateway/${apiName}`,
      routes: Object.values(routes),
    });

    this.dashboard = new cloudwatch.Dashboard(this, 'Dashboard', {
      dashboardName: `${resourcePrefix}-dashboard`,
    });

    tables.forEach((table) => {
      this.createDynamoDBAlarms(table);
      this.addDynamoDBWidgets(table);
    });

    this.createApiGatewayAlarms(apiName, environment, resourcePrefix);
    this.addApiGatewayWidgets(apiName, environment);

    lambdas.forEach((fn) => {
      this.createLambdaAlarms(fn);
    });
    this.addLambdaWidgets(lambdas);

    this.performanceDashboard = this.createPerformanceDashboard(
      resourcePrefix,
      tables,
      apiName,
      environment,
      lambdas,
    );
  }

  private createDynamoDBAlarms(table: dynamodb.ITable) {
    const id = this.formatResource(table.tableName); //Udp-Data-Dev

    this.warningAlarm(`${id}-Dynamo-ReadThrottled`, {
      alarmName: `${table.tableName}-dynamo-read-throttled`,
      alarmDescription: 'Dynamodb read requests are being throttled',
      metric: table.metricThrottledRequestsForOperations({
        operations: [dynamodb.Operation.GET_ITEM, dynamodb.Operation.QUERY],
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.warningAlarm(`${id}-Dynamo-WriteThrottled`, {
      alarmName: `${table.tableName}-dynamo-write-throttled`,
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
    });

    this.warningAlarm(`${id}-Dynamo-SystemErrors`, {
      alarmName: `${table.tableName}-dynamo-system-errors`,
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
    });
  }

  private addDynamoDBWidgets(table: dynamodb.ITable): void {
    const title = this.formatResource(table.tableName);
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: `${title}-Dynamo - Read/Write Capacity`,
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
        title: `${title}-Dynamo - Latency`,
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

  private createApiMetric(
    apiName: string,
    stage: string,
    metricName: string,
    statistic: string,
  ): cloudwatch.Metric {
    return new cloudwatch.Metric({
      namespace: 'AWS/ApiGateway',
      metricName,
      dimensionsMap: {
        ApiName: apiName,
        Stage: stage,
      },
      period: Duration.minutes(1),
      statistic,
    });
  }

  private createApiGatewayAlarms(
    apiName: string,
    stage: string,
    resourcePrefix: string,
  ): void {
    const errorRateMatric = new cloudwatch.MathExpression({
      expression: '(errors / requests) * 100',
      usingMetrics: {
        errors: this.createApiMetric(apiName, stage, '5xxError', 'Sum'),
        requests: this.createApiMetric(apiName, stage, 'Count', 'Sum'),
      },
      period: Duration.minutes(1),
      label: '%xx Error Rate (%)',
    });

    this.warningAlarm('ApiGateway5xxErrors', {
      alarmName: `${resourcePrefix}-api-5xx-errors`,
      alarmDescription: `API Gateway 5xx error rate exceeds ${NFR.MAX_ERROR_RATE_PERCENT}%`,
      metric: errorRateMatric,
      threshold: NFR.MAX_ERROR_RATE_PERCENT,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.warningAlarm('ApiGateway4xxErrors', {
      alarmName: `${resourcePrefix}-api-4xx-errors`,
      alarmDescription: 'API Gateway 4xx error rate is high',
      metric: this.createApiMetric(apiName, stage, '4xxError', 'Sum'),
      threshold: 50,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    // Cold-start filter: in a low-traffic minute one cold start owns the p95,
    // so only evaluate latency when there is enough traffic for it to mean
    // something.
    this.warningAlarm('ApiGatewayLatency', {
      alarmName: `${resourcePrefix}-api-latency`,
      alarmDescription: `API Gateway p95 latency exceeds ${NFR.P95_LATENCY_MS}ms (minutes with < ${SLO_MIN_REQUESTS} requests ignored to filter cold starts)`,
      metric: new cloudwatch.MathExpression({
        expression: `IF(requests >= ${SLO_MIN_REQUESTS}, latency, 0)`,
        usingMetrics: {
          latency: this.createApiMetric(apiName, stage, 'Latency', 'p95'),
          requests: this.createApiMetric(apiName, stage, 'Count', 'Sum'),
        },
        period: Duration.minutes(1),
        label: 'p95 latency (warm traffic)',
      }),
      threshold: NFR.P95_LATENCY_MS,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  private addApiGatewayWidgets(apiName: string, stage: string): void {
    this.dashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Api Gateway - Requests & Errors',
        left: [
          this.createApiMetric(apiName, stage, 'Count', 'Sum'),
          this.createApiMetric(apiName, stage, '4xxError', 'Sum'),
          this.createApiMetric(apiName, stage, '5xxError', 'Sum'),
        ],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Api Gateway - Latency',
        left: [
          this.createApiMetric(apiName, stage, 'Latency', 'Average'),
          this.createApiMetric(apiName, stage, 'Latency', 'p99'),
          this.createApiMetric(apiName, stage, 'IntegrationLatency', 'Average'),
        ],
        width: 12,
      }),
    );
  }

  private createLambdaAlarms(fn: lambda.IFunction): void {
    const id = this.formatResource(fn.functionName);

    this.warningAlarm(`${id}-Errors`, {
      alarmName: `${fn.functionName}-errors`,
      alarmDescription: 'Lambda error count excceeds threashold',
      metric: fn.metricErrors({ period: Duration.minutes(1) }),
      threshold: 2,
      evaluationPeriods: 2,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.warningAlarm(`${id}-Duration`, {
      alarmName: `${fn.functionName}-duration`,
      alarmDescription: `Lambda p95 duration exceeds ${NFR.LAMBDA_DURATION_P95_MS}ms (minutes with < ${SLO_MIN_REQUESTS} invocations ignored to filter cold starts)`,
      metric: new cloudwatch.MathExpression({
        expression: `IF(invocations >= ${SLO_MIN_REQUESTS}, duration, 0)`,
        usingMetrics: {
          duration: fn.metricDuration({
            period: Duration.minutes(1),
            statistic: 'p95',
          }),
          invocations: fn.metricInvocations({ period: Duration.minutes(1) }),
        },
        period: Duration.minutes(1),
        label: 'p95 duration (warm traffic)',
      }),
      threshold: NFR.LAMBDA_DURATION_P95_MS,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });

    this.warningAlarm(`${id}-Throttles`, {
      alarmName: `${fn.functionName}-throttles`,
      alarmDescription: 'Lambda is being throttled',
      metric: fn.metricThrottles({
        period: Duration.minutes(1),
        statistic: 'Sum',
      }),
      threshold: 1,
      evaluationPeriods: 3,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
  }

  private addLambdaWidgets(lambdas: lambda.IFunction[]): void {
    this.dashboard.addWidgets(
      ...lambdas.map((fn) => {
        const title = this.formatResource(fn.functionName);
        return new cloudwatch.GraphWidget({
          title: title,
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
        });
      }),
    );
  }

  private createPerformanceDashboard(
    resourcePrefix: string,
    tables: dynamodb.ITable[],
    apiName: string,
    stage: string,
    lambdas: lambda.IFunction[],
  ): cloudwatch.Dashboard {
    const perfDashboard = new cloudwatch.Dashboard(
      this,
      'PerformanceDashboard',
      {
        dashboardName: `${resourcePrefix}-performance`,
      },
    );

    const lambdaEntries = lambdas.map((fn) => ({
      fn,
      title: this.formatResource(fn.functionName),
    }));
    const tableEntries = tables.map((table) => ({
      table,
      title: this.formatResource(table.tableName),
    }));

    const nfrLatencyAnnotation: cloudwatch.HorizontalAnnotation = {
      value: NFR.P95_LATENCY_MS,
      label: `NFR P95 (${NFR.P95_LATENCY_MS}ms)`,
      color: '#d62728',
    };

    const nfrErrorRateAnnotation: cloudwatch.HorizontalAnnotation = {
      value: NFR.MAX_ERROR_RATE_PERCENT,
      label: `NFR Error Rate (${NFR.MAX_ERROR_RATE_PERCENT}%)`,
      color: '#d62728',
    };

    const nfrThrottleAnnotation: cloudwatch.HorizontalAnnotation = {
      value: 1,
      label: 'Throttle Threshold (1)',
      color: '#d62728',
    };

    const errorRateExpression = new cloudwatch.MathExpression({
      expression: '(errors / requests) * 100',
      usingMetrics: {
        errors: this.createApiMetric(apiName, stage, '5xxError', 'Sum'),
        requests: this.createApiMetric(apiName, stage, 'Count', 'Sum'),
      },
      period: Duration.minutes(1),
      label: '5xx Error Rate (%)',
    });

    // ── Section 1: NFR Summary ──────────────────────────────────────────
    perfDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# NFR Summary',
        width: 24,
        height: 1,
      }),
    );

    perfDashboard.addWidgets(
      new cloudwatch.SingleValueWidget({
        title: 'P95 Latency (ms)',
        metrics: [this.createApiMetric(apiName, stage, 'Latency', 'p95')],
        width: 8,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Error Rate (%)',
        metrics: [errorRateExpression],
        width: 8,
        height: 4,
      }),
      new cloudwatch.SingleValueWidget({
        title: 'Request Throughput (rpm)',
        metrics: [this.createApiMetric(apiName, stage, 'Count', 'Sum')],
        width: 8,
        height: 4,
      }),
    );

    // ── Section 2: Latency Breakdown ────────────────────────────────────
    perfDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# Latency Breakdown',
        width: 24,
        height: 1,
      }),
    );

    perfDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'API Gateway - End-to-End Latency',
        left: [
          this.createApiMetric(apiName, stage, 'Latency', 'p50'),
          this.createApiMetric(apiName, stage, 'Latency', 'p95'),
          this.createApiMetric(apiName, stage, 'Latency', 'p99'),
        ],
        leftAnnotations: [nfrLatencyAnnotation],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'API Gateway - Integration Latency',
        left: [
          this.createApiMetric(apiName, stage, 'IntegrationLatency', 'p50'),
          this.createApiMetric(apiName, stage, 'IntegrationLatency', 'p95'),
          this.createApiMetric(apiName, stage, 'IntegrationLatency', 'p99'),
        ],
        leftAnnotations: [nfrLatencyAnnotation],
        width: 12,
      }),
    );

    perfDashboard.addWidgets(
      ...lambdaEntries.map(
        ({ fn, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title} - Duration`,
            left: [
              fn.metricDuration({
                period: Duration.minutes(1),
                statistic: 'p50',
              }),
              fn.metricDuration({
                period: Duration.minutes(1),
                statistic: 'p95',
              }),
              fn.metricDuration({
                period: Duration.minutes(1),
                statistic: 'p99',
              }),
            ],
            leftAnnotations: [
              {
                value: NFR.LAMBDA_DURATION_P95_MS,
                label: `NFR Lambda P95 (${NFR.LAMBDA_DURATION_P95_MS}ms)`,
                color: '#d62728',
              },
            ],
            width: 12,
          }),
      ),
    );

    perfDashboard.addWidgets(
      ...tableEntries.map(
        ({ table, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title}-Dynamo - Request Latency`,
            left: [
              table.metricSuccessfulRequestLatency({
                dimensionsMap: {
                  TableName: table.tableName,
                  Operation: 'GetItem',
                },
                period: Duration.minutes(1),
                statistic: 'p50',
              }),
              table.metricSuccessfulRequestLatency({
                dimensionsMap: {
                  TableName: table.tableName,
                  Operation: 'PutItem',
                },
                period: Duration.minutes(1),
                statistic: 'p50',
              }),
              table.metricSuccessfulRequestLatency({
                dimensionsMap: {
                  TableName: table.tableName,
                  Operation: 'Query',
                },
                period: Duration.minutes(1),
                statistic: 'p50',
              }),
              table.metricSuccessfulRequestLatency({
                dimensionsMap: {
                  TableName: table.tableName,
                  Operation: 'GetItem',
                },
                period: Duration.minutes(1),
                statistic: 'Average',
              }),
              table.metricSuccessfulRequestLatency({
                dimensionsMap: {
                  TableName: table.tableName,
                  Operation: 'PutItem',
                },
                period: Duration.minutes(1),
                statistic: 'Average',
              }),
            ],
            width: 12,
          }),
      ),
    );

    // ── Section 3: Error Analysis ───────────────────────────────────────
    perfDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# Error Analysis',
        width: 24,
        height: 1,
      }),
    );

    perfDashboard.addWidgets(
      new cloudwatch.GraphWidget({
        title: 'Error Rate Over Time (%)',
        left: [errorRateExpression],
        leftAnnotations: [nfrErrorRateAnnotation],
        width: 12,
      }),
      new cloudwatch.GraphWidget({
        title: 'Error Counts by Type',
        left: [
          this.createApiMetric(apiName, stage, '4xxError', 'Sum'),
          this.createApiMetric(apiName, stage, '5xxError', 'Sum'),
        ],
        stacked: true,
        width: 12,
      }),
    );

    perfDashboard.addWidgets(
      ...lambdaEntries.map(
        ({ fn, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title} - Errors`,
            left: [fn.metricErrors({ period: Duration.minutes(1) })],
            width: 12,
          }),
      ),
    );

    perfDashboard.addWidgets(
      ...tableEntries.map(
        ({ table, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title}-Dynamo - System Errors`,
            left: [
              table.metricSystemErrorsForOperations({
                operations: [
                  dynamodb.Operation.GET_ITEM,
                  dynamodb.Operation.PUT_ITEM,
                  dynamodb.Operation.QUERY,
                ],
                period: Duration.minutes(1),
                statistic: 'Sum',
              }),
            ],
            width: 12,
          }),
      ),
    );

    // ── Section 4: Throttling & Capacity ────────────────────────────────
    perfDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# Throttling & Capacity',
        width: 24,
        height: 1,
      }),
    );

    tableEntries.forEach(({ table, title }) => {
      perfDashboard.addWidgets(
        new cloudwatch.GraphWidget({
          title: `${title}-Dynamo - Consumed Capacity`,
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
          title: `${title}-Dynamo - Throttled Requests`,
          left: [
            table.metricThrottledRequestsForOperations({
              operations: [
                dynamodb.Operation.GET_ITEM,
                dynamodb.Operation.QUERY,
              ],
              period: Duration.minutes(1),
              statistic: 'Sum',
              label: 'Read Throttles',
            }),
            table.metricThrottledRequestsForOperations({
              operations: [
                dynamodb.Operation.PUT_ITEM,
                dynamodb.Operation.UPDATE_ITEM,
              ],
              period: Duration.minutes(1),
              statistic: 'Sum',
              label: 'Write Throttles',
            }),
          ],
          leftAnnotations: [nfrThrottleAnnotation],
          width: 12,
        }),
      );
    });

    perfDashboard.addWidgets(
      ...lambdaEntries.map(
        ({ fn, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title} - Throttles`,
            left: [fn.metricThrottles({ period: Duration.minutes(1) })],
            leftAnnotations: [nfrThrottleAnnotation],
            width: 12,
          }),
      ),
    );

    // ── Section 5: Lambda Scaling & Cold Starts ─────────────────────────
    perfDashboard.addWidgets(
      new cloudwatch.TextWidget({
        markdown: '# Lambda Scaling & Cold Starts',
        width: 24,
        height: 1,
      }),
    );

    perfDashboard.addWidgets(
      ...lambdaEntries.map(
        ({ fn, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title} - Concurrent Executions`,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'ConcurrentExecutions',
                dimensionsMap: { FunctionName: fn.functionName },
                period: Duration.minutes(1),
                statistic: 'Maximum',
              }),
            ],
            width: 12,
          }),
      ),
    );

    perfDashboard.addWidgets(
      ...lambdaEntries.map(
        ({ fn, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title} - Init Duration (Cold Start)`,
            left: [
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'InitDuration',
                dimensionsMap: { FunctionName: fn.functionName },
                period: Duration.minutes(1),
                statistic: 'p50',
                label: 'Init Duration p50',
              }),
              new cloudwatch.Metric({
                namespace: 'AWS/Lambda',
                metricName: 'InitDuration',
                dimensionsMap: { FunctionName: fn.functionName },
                period: Duration.minutes(1),
                statistic: 'p95',
                label: 'Init Duration p95',
              }),
            ],
            width: 12,
          }),
      ),
    );

    perfDashboard.addWidgets(
      ...lambdaEntries.map(
        ({ fn, title }) =>
          new cloudwatch.GraphWidget({
            title: `${title} - Invocations`,
            left: [fn.metricInvocations({ period: Duration.minutes(1) })],
            width: 12,
          }),
      ),
    );

    return perfDashboard;
  }

  /**
   * Operational alarms are warnings: useful, but they should not page anyone
   * on their own. The critical set lives in CriticalAlarms.
   */
  private warningAlarm(id: string, props: cloudwatch.AlarmProps): void {
    const alarm = new cloudwatch.Alarm(this, id, {
      ...props,
      alarmName: this.routing.alarmName(
        props.alarmName ?? id,
        AlarmSeverity.Warning,
      ),
    });
    this.routing.route(alarm, AlarmSeverity.Warning);
  }

  private loadMonitoringInventory(): MonitoringInventory {
    const inventoryPath = path.resolve(
      __dirname,
      '../../.generated/monitoring-inventory.json',
    );

    if (!fs.existsSync(inventoryPath)) {
      // Add failback to resolve the inventory is not generated during cdk destroy
      return { lambdaNames: [], tableNames: [] };
    }

    return JSON.parse(
      fs.readFileSync(inventoryPath, 'utf8'),
    ) as MonitoringInventory;
  }

  private formatResource(resourceName: string): string {
    return resourceName
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('-');
  }
}
