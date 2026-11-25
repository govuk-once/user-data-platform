import { Duration, Stack } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import { GovUKTag } from '@govuk-connect/tag';
import {
  UDP_METRIC_NAMESPACE,
  UdpMetricNames,
  type RouteConfig,
} from '@libs/utils';
import {
  burnRateThresholdPercent,
  JOURNEY_SLOS,
  SLO_MIN_REQUESTS,
} from 'cdk/constants/slo';
import { mainStackParameterNames } from 'cdk/constants/shared-parameters';
import { AlarmRouting, AlarmSeverity } from './alarm-routing';

const RUNBOOK_URL =
  'https://github.com/govuk-once/user-data-platform/blob/main/docs/critical-alerting.md';

export interface CriticalAlarmsProps {
  readonly routing: AlarmRouting;
  /** `<developerId>-<env>` or `<env>`, used to prefix alarm/metric names. */
  readonly resourcePrefix: string;
  /** Value of the `STACK` Lambda env var, used as the EMF metric dimension. */
  readonly stackPrefix: string;
  readonly developerId?: string;
  readonly environment: string;
  /** Name of the API Gateway access log group (`/aws/apigateway/<api>`). */
  readonly apiAccessLogGroupName: string;
  readonly routes: RouteConfig[];
}

interface BurnRateAlarmConfig {
  readonly slug: string;
  readonly alertText: string;
  readonly detail: string;
  readonly total: (period: Duration) => cloudwatch.IMetric;
  readonly bad: (period: Duration) => cloudwatch.IMetric;
  readonly thresholdPercent: number;
  readonly longWindow: Duration;
  readonly shortWindow: Duration;
}

/**
 * Critical alarms C1–C3 and C5–C7 from the UDP critical alerting strategy.
 * C4 (synthetic canary) and the read-after-write half of C5 are not built yet;
 * see docs/critical-alerting.md.
 */
export class CriticalAlarms extends Construct {
  public readonly alarms: cloudwatch.AlarmBase[] = [];

  private readonly routing: AlarmRouting;
  private readonly resourcePrefix: string;
  private readonly metricNamespace: string;
  private readonly accessLogs: logs.ILogGroup;

  constructor(scope: Construct, id: string, props: CriticalAlarmsProps) {
    super(scope, id);

    this.routing = props.routing;
    this.resourcePrefix = props.resourcePrefix;
    this.metricNamespace = `${UDP_METRIC_NAMESPACE}/${props.resourcePrefix}`;
    this.accessLogs = logs.LogGroup.fromLogGroupName(
      this,
      'ApiAccessLogs',
      props.apiAccessLogGroupName,
    );

    this.createJourneyAlarms(props.routes);
    this.createDataIntegrityAlarm(props.stackPrefix);
    this.createDataAtRiskAlarm(props);
    this.createAuthFailureAlarm();
  }

  /** C1, C2, C3: multi-window fast-burn alarms on 5xx per journey. */
  private createJourneyAlarms(routes: RouteConfig[]): void {
    for (const [key, slo] of Object.entries(JOURNEY_SLOS)) {
      const journeyRoutes = routes.filter(slo.matches);
      if (journeyRoutes.length === 0) continue;

      const routeFilter = logs.FilterPattern.any(
        ...journeyRoutes.map((route) =>
          logs.FilterPattern.all(
            logs.FilterPattern.stringValue('$.resourcePath', '=', route.path),
            logs.FilterPattern.stringValue('$.httpMethod', '=', route.method),
          ),
        ),
      );

      const total = this.accessLogMetric(
        `${key}Requests`,
        `Journey-${key}-Requests`,
        routeFilter,
      );
      const bad = this.accessLogMetric(
        `${key}ServerErrors`,
        `Journey-${key}-ServerErrors`,
        logs.FilterPattern.all(
          routeFilter,
          logs.FilterPattern.stringValue('$.status', '=', '5*'),
        ),
      );

      const thresholdPercent = burnRateThresholdPercent(slo);
      this.createBurnRateAlarm({
        slug: slo.alarmSlug,
        alertText: slo.alertText,
        detail:
          `${slo.journey}: 5xx rate > ${thresholdPercent}% over both 1h and 5m ` +
          `(min ${SLO_MIN_REQUESTS} requests/h). Routes: ` +
          journeyRoutes.map((r) => `${r.method} ${r.path}`).join(', '),
        total,
        bad,
        thresholdPercent,
        longWindow: Duration.hours(1),
        shortWindow: Duration.minutes(5),
      });
    }
  }

  /** C5: any decrypt / AES-GCM integrity failure within 5 minutes. */
  private createDataIntegrityAlarm(stackPrefix: string): void {
    const alarm = new cloudwatch.Alarm(this, 'DataIntegrity', {
      alarmName: this.routing.alarmName(
        `${this.resourcePrefix}-c5-data-integrity`,
        AlarmSeverity.Critical,
      ),
      alarmDescription: this.description(
        '🔴 DATA INTEGRITY: Saved user data cannot be read back correctly.',
        'At least one KMS data-key decrypt or AES-GCM integrity failure in 5 minutes. ' +
          'Search Lambda logs for "DecryptionFailure" to see decryptStage and errorName.',
        'c5',
      ),
      metric: new cloudwatch.Metric({
        namespace: UDP_METRIC_NAMESPACE,
        metricName: UdpMetricNames.DecryptionFailure,
        dimensionsMap: { Stack: stackPrefix },
        statistic: 'Sum',
        period: Duration.minutes(5),
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.routing.route(alarm, AlarmSeverity.Critical);
    this.alarms.push(alarm);
  }

  /**
   * C6: destructive change to the KMS keys or DynamoDB tables that hold user
   * data. CloudTrail management events -> EventBridge rules -> alarm on the
   * rules' TriggeredRules metric. Matched events are kept on an SQS queue so
   * responders can see exactly who changed what.
   */
  private createDataAtRiskAlarm(props: CriticalAlarmsProps): void {
    const stack = Stack.of(this);
    const params = mainStackParameterNames(props.stackPrefix);
    const keyArns = [params.kmsKeyArn, params.dbKmsKeyArn].map((name) =>
      StringParameter.valueForStringParameter(this, name),
    );

    const tablePrefix = props.developerId ? `${props.developerId}-` : '';
    const tableNames = ['udp-data', 'udp-identity'].map(
      (table) => `${tablePrefix}${table}-${props.environment}`,
    );
    const tableIdentifiers = tableNames.flatMap((name) => [
      name,
      stack.formatArn({
        service: 'dynamodb',
        resource: 'table',
        resourceName: name,
      }),
    ]);

    const auditQueue = new sqs.Queue(this, 'DataAtRiskEvents', {
      queueName: `${this.resourcePrefix}-data-at-risk-events`,
      encryption: sqs.QueueEncryption.SQS_MANAGED,
      enforceSSL: true,
      retentionPeriod: Duration.days(14),
    });
    GovUKTag.of(auditQueue)
      .DataClassification.OFFICIAL()
      .PII.FALSE()
      .Exposure.ISOLATED();

    const cloudTrailEvent = (
      source: string,
      detail: Record<string, unknown>,
    ): events.EventPattern => ({
      source: [source],
      detailType: ['AWS API Call via CloudTrail'],
      detail,
    });

    const rules = [
      new events.Rule(this, 'KmsKeyAtRisk', {
        description: `${this.resourcePrefix}: KMS key protecting UDP data disabled, scheduled for deletion or policy changed`,
        eventPattern: cloudTrailEvent('aws.kms', {
          eventName: [
            'DisableKey',
            'ScheduleKeyDeletion',
            'PutKeyPolicy',
            'DeleteImportedKeyMaterial',
          ],
          resources: { ARN: keyArns },
        }),
      }),
      new events.Rule(this, 'TableDeleted', {
        description: `${this.resourcePrefix}: UDP DynamoDB table deleted`,
        eventPattern: cloudTrailEvent('aws.dynamodb', {
          eventName: ['DeleteTable'],
          requestParameters: { tableName: tableIdentifiers },
        }),
      }),
      new events.Rule(this, 'PitrDisabled', {
        description: `${this.resourcePrefix}: point-in-time recovery disabled on a UDP DynamoDB table`,
        eventPattern: cloudTrailEvent('aws.dynamodb', {
          eventName: ['UpdateContinuousBackups'],
          requestParameters: {
            tableName: tableIdentifiers,
            pointInTimeRecoverySpecification: {
              pointInTimeRecoveryEnabled: [false],
            },
          },
        }),
      }),
    ];

    const usingMetrics: Record<string, cloudwatch.IMetric> = {};
    rules.forEach((rule, i) => {
      rule.addTarget(new targets.SqsQueue(auditQueue));
      usingMetrics[`r${i}`] = new cloudwatch.Metric({
        namespace: 'AWS/Events',
        metricName: 'TriggeredRules',
        dimensionsMap: { RuleName: rule.ruleName },
        statistic: 'Sum',
        period: Duration.minutes(5),
      });
    });

    const alarm = new cloudwatch.Alarm(this, 'DataAtRisk', {
      alarmName: this.routing.alarmName(
        `${this.resourcePrefix}-c6-data-at-risk`,
        AlarmSeverity.Critical,
      ),
      alarmDescription: this.description(
        '🔴 DATA AT RISK: A destructive change has been made to a critical UDP resource.',
        'KMS key disabled/scheduled for deletion/policy changed, DynamoDB table deleted, or PITR disabled. ' +
          `The CloudTrail event is on SQS queue ${auditQueue.queueName}.`,
        'c6',
      ),
      metric: new cloudwatch.MathExpression({
        expression: Object.keys(usingMetrics)
          .map((id) => `FILL(${id}, 0)`)
          .join(' + '),
        usingMetrics,
        period: Duration.minutes(5),
        label: 'Destructive changes',
      }),
      threshold: 1,
      evaluationPeriods: 1,
      comparisonOperator:
        cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
    });
    this.routing.route(alarm, AlarmSeverity.Critical);
    this.alarms.push(alarm);
  }

  /** C7: 403s above 50% of requests over both 15m and 5m. */
  private createAuthFailureAlarm(): void {
    const total = this.accessLogMetric(
      'AllRequests',
      'Api-Requests',
      logs.FilterPattern.allEvents(),
    );
    const forbidden = this.accessLogMetric(
      'Forbidden',
      'Api-Forbidden',
      logs.FilterPattern.stringValue('$.status', '=', '403'),
    );

    this.createBurnRateAlarm({
      slug: 'c7-auth-failure',
      alertText:
        '🔴 AUTH FAILURE: UDP is rejecting most authenticated requests.',
      detail: `403s > 50% of requests over both 15m and 5m (min ${SLO_MIN_REQUESTS} requests/15m).`,
      total,
      bad: forbidden,
      thresholdPercent: 50,
      longWindow: Duration.minutes(15),
      shortWindow: Duration.minutes(5),
    });
  }

  /**
   * Long window AND short window, as a composite alarm. Only the composite
   * has actions; the child alarms exist purely as inputs.
   */
  private createBurnRateAlarm(config: BurnRateAlarmConfig): void {
    const windowAlarm = (window: Duration, minRequests: number) => {
      const label = `${window.toMinutes()}m`;
      const guard = minRequests > 0 ? `total >= ${minRequests}` : 'total > 0';
      return new cloudwatch.Alarm(this, `${config.slug}-${label}`, {
        alarmName: `${this.resourcePrefix}-${config.slug}-${label}-window`,
        alarmDescription: `Input to ${config.slug} composite alarm (no actions).`,
        metric: new cloudwatch.MathExpression({
          expression: `IF(${guard}, 100 * FILL(bad, 0) / total, 0)`,
          usingMetrics: {
            total: config.total(window),
            bad: config.bad(window),
          },
          period: window,
          label: `Bad request % (${label})`,
        }),
        threshold: config.thresholdPercent,
        evaluationPeriods: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
    };

    const longAlarm = windowAlarm(config.longWindow, SLO_MIN_REQUESTS);
    const shortAlarm = windowAlarm(config.shortWindow, 0);

    const composite = new cloudwatch.CompositeAlarm(this, config.slug, {
      compositeAlarmName: this.routing.alarmName(
        `${this.resourcePrefix}-${config.slug}`,
        AlarmSeverity.Critical,
      ),
      alarmDescription: this.description(
        config.alertText,
        config.detail,
        config.slug.split('-')[0],
      ),
      alarmRule: cloudwatch.AlarmRule.allOf(
        cloudwatch.AlarmRule.fromAlarm(longAlarm, cloudwatch.AlarmState.ALARM),
        cloudwatch.AlarmRule.fromAlarm(shortAlarm, cloudwatch.AlarmState.ALARM),
      ),
    });
    this.routing.route(composite, AlarmSeverity.Critical);
    this.alarms.push(composite);
  }

  /** Counts API Gateway access log lines matching `pattern`. */
  private accessLogMetric(
    id: string,
    metricName: string,
    pattern: logs.IFilterPattern,
  ): (period: Duration) => cloudwatch.IMetric {
    const filter = new logs.MetricFilter(this, `${id}Filter`, {
      logGroup: this.accessLogs,
      metricNamespace: this.metricNamespace,
      metricName,
      filterPattern: pattern,
      metricValue: '1',
      defaultValue: 0,
    });
    return (period) => filter.metric({ statistic: 'Sum', period });
  }

  private description(
    alertText: string,
    detail: string,
    anchor: string,
  ): string {
    return `${alertText}\n${detail}\nRunbook: ${RUNBOOK_URL}#${anchor}`;
  }
}
