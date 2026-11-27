import { Stack } from 'aws-cdk-lib';
import * as cloudwatch from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import * as sns from 'aws-cdk-lib/aws-sns';
import { Construct } from 'constructs';
import { GovUkOnceEnvironments } from 'cdk/constants/environment';

/**
 * Severity as defined by the UDP critical alerting strategy
 * (docs/critical-alerting.md).
 */
export enum AlarmSeverity {
  /** Users are significantly affected or data is at risk. Pages. */
  Critical = 'critical',
  /** Useful signal that should not wake anybody up on its own. */
  Warning = 'warning',
}

/** SNS topic created in every account by the platform notifications spoke. */
export const NOTIFICATIONS_HUB_TOPIC_NAME = 'notifications-cloudwatch-alarms';

/** Slack channel for production critical alarms (no leading #). */
export const CRITICAL_ALARMS_CHANNEL = 'govuk-connect-critical-alarms';

/** Notifications hub severity codes (s=). */
const HUB_SEVERITY = { critical: 1, high: 2 } as const;

export interface AlarmRoutingProps {
  readonly environment: string;
  readonly developerId?: string;
  /** Existing topic carrying PagerDuty/email subscriptions for criticals. */
  readonly criticalTopic: sns.ITopic;
  readonly warningTopic: sns.ITopic;
}

/**
 * Decides where an alarm goes and how it is named for the notifications hub.
 *
 * - prod critical  -> hub, `[c=govuk-connect-critical-alarms, s=1]` (Slack + Teams), and criticalTopic (PagerDuty)
 * - prod warning   -> hub, `[s=2]` (spoke default channel), and warningTopic
 * - dev/stag       -> everything is sent to the hub as `[s=2]`, keeping the
 *                     critical channel prod-only. Criticals still go to
 *                     criticalTopic so per-env PagerDuty config is honoured.
 * - developer stacks -> no hub actions (avoids personal stacks posting to
 *                     shared Slack); legacy topics only.
 */
export class AlarmRouting extends Construct {
  private readonly hubAction?: SnsAction;
  private readonly criticalAction: SnsAction;
  private readonly warningAction: SnsAction;
  private readonly isProd: boolean;

  constructor(scope: Construct, id: string, props: AlarmRoutingProps) {
    super(scope, id);

    const { environment, developerId, criticalTopic, warningTopic } = props;
    const stack = Stack.of(this);

    this.isProd = !developerId && environment === GovUkOnceEnvironments.Prod;
    this.criticalAction = new SnsAction(criticalTopic);
    this.warningAction = new SnsAction(warningTopic);

    if (!developerId) {
      this.hubAction = new SnsAction(
        sns.Topic.fromTopicArn(
          this,
          'NotificationsHubTopic',
          stack.formatArn({
            service: 'sns',
            resource: NOTIFICATIONS_HUB_TOPIC_NAME,
          }),
        ),
      );
    }
  }

  /**
   * Builds the alarm name, appending the hub routing tag. Must be used for the
   * `alarmName` of every alarm later passed to {@link route}.
   */
  public alarmName(baseName: string, severity: AlarmSeverity): string {
    if (!this.hubAction) return baseName;

    return this.isProd && severity === AlarmSeverity.Critical
      ? `${baseName} [c=${CRITICAL_ALARMS_CHANNEL}, s=${HUB_SEVERITY.critical}]`
      : `${baseName} [s=${HUB_SEVERITY.high}]`;
  }

  /** Attaches alarm + OK actions for the given severity. */
  public route(alarm: cloudwatch.AlarmBase, severity: AlarmSeverity): void {
    const legacy =
      severity === AlarmSeverity.Critical
        ? this.criticalAction
        : this.warningAction;

    alarm.addAlarmAction(legacy);

    if (this.hubAction) {
      alarm.addAlarmAction(this.hubAction);
      alarm.addOkAction(this.hubAction);
    }
  }
}
