import { Construct } from 'constructs';
import * as wafv2 from 'aws-cdk-lib/aws-wafv2';
import * as logs from 'aws-cdk-lib/aws-logs';
import { RemovalPolicy } from 'aws-cdk-lib';

export interface RateLimitingConfig {
  readonly enabled?: boolean;
  readonly limit?: number;
}

export interface ManagedRuleConfig {
  readonly enabled?: boolean;
  readonly action?: 'block' | 'count';
}

export interface WafConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly namePrefix?: string;
  readonly apiGatewayStageArn: string;
  readonly rateLimiting?: RateLimitingConfig;
  readonly sqlInjectionRule?: ManagedRuleConfig;
  readonly commonRuleSet?: ManagedRuleConfig;
  readonly enableLogging?: boolean;
  readonly logRetentionDays?: number;
}

export class WafConstruct extends Construct {
  public readonly webAcl: wafv2.CfnWebACL;
  public readonly logGroup?: logs.LogGroup;

  constructor(scope: Construct, id: string, props: WafConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      namePrefix = 'api',
      apiGatewayStageArn,
      rateLimiting = { enabled: true, limit: 2000 },
      sqlInjectionRule = { enabled: true, action: 'block' },
      commonRuleSet = { enabled: true, action: 'block' },
      enableLogging = true,
      logRetentionDays = 30,
    } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${namePrefix}`
      : namePrefix;

    const webAclName = `${resourcePrefix}-${environment}`;

    const rules: wafv2.CfnWebACL.RuleProperty[] = [];
    let priority = 1;

    if (rateLimiting.enabled) {
      rules.push({
        name: 'RateLimitRule',
        priority: priority++,
        action: { block: {} },
        statement: {
          rateBasedStatement: {
            limit: rateLimiting.limit ?? 2000,
            aggregateKeyType: 'IP',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${resourcePrefix}-rat-limit`,
          sampledRequestsEnabled: true,
        },
      });
    }

    if (sqlInjectionRule.enabled) {
      rules.push({
        name: 'AWSManagedRulesSQLiRuleSet',
        priority: priority++,
        overrideAction:
          sqlInjectionRule.action === 'block' ? { none: {} } : { count: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesSQLiRuleSet',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${resourcePrefix}-sqli`,
          sampledRequestsEnabled: true,
        },
      });
    }

    if (commonRuleSet.enabled) {
      rules.push({
        name: 'AWSManagedRulesCommonRuleSet',
        priority: priority++,
        overrideAction:
          commonRuleSet.action === 'block' ? { none: {} } : { count: {} },
        statement: {
          managedRuleGroupStatement: {
            vendorName: 'AWS',
            name: 'AWSManagedRulesCommonRuleSet',
          },
        },
        visibilityConfig: {
          cloudWatchMetricsEnabled: true,
          metricName: `${resourcePrefix}-common`,
          sampledRequestsEnabled: true,
        },
      });
    }

    this.webAcl = new wafv2.CfnWebACL(this, 'WebAcl', {
      name: webAclName,
      description: `WAF Web ACL for ${resourcePrefix} APi Gateway`,
      scope: 'REGIONAL',
      defaultAction: { allow: {} },
      rules,
      visibilityConfig: {
        cloudWatchMetricsEnabled: true,
        metricName: `${resourcePrefix}-waf`,
        sampledRequestsEnabled: true,
      },
    });

    new wafv2.CfnWebACLAssociation(this, 'WebAclAssociation', {
      resourceArn: apiGatewayStageArn,
      webAclArn: this.webAcl.attrArn,
    });

    if (enableLogging) {
      this.logGroup = new logs.LogGroup(this, 'WafLogs', {
        logGroupName: `aws-waf-logs-${resourcePrefix}-${environment}`,
        retention: logRetentionDays,
        removalPolicy: RemovalPolicy.DESTROY,
      });

      new wafv2.CfnLoggingConfiguration(this, 'logingConfig', {
        logDestinationConfigs: [this.logGroup.logGroupArn],
        resourceArn: this.webAcl.attrArn,
        redactedFields: [
          {
            singleHeader: { Name: 'authorization' },
          },
        ],
      });
    }
  }
}
