import { Duration, Stack, StackProps } from 'aws-cdk-lib';
import {
  BackupPlan,
  BackupPlanRule,
  BackupResource,
  BackupVault,
  BackupVaultEvents,
  CfnBackupVault,
} from 'aws-cdk-lib/aws-backup';
import { Schedule } from 'aws-cdk-lib/aws-events';
import {
  AccountRootPrincipal,
  ArnPrincipal,
  Effect,
  ManagedPolicy,
  PolicyDocument,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { getRemovalPolicy } from 'cdk/constants/environment';
import { Construct } from 'constructs';

export interface BackupStackProps extends StackProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly stackPrefix: string;
  readonly notificationEmail?: string;
}

export class BackupStack extends Stack {
  constructor(scope: Construct, id: string, props: BackupStackProps) {
    super(scope, id, props);

    const { developerId, environment, notificationEmail } = props;

    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    // ---- IAM Role -------------------

    const backupRole = new Role(this, 'BackupRole', {
      roleName: `${resourcePrefix}-infra-backup`,
      assumedBy: new ServicePrincipal('backup.amazonaws.com'),
      managedPolicies: [
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSBackupServiceRolePolicyForBackup',
        ),
        ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSBackupServiceRolePolicyForRestores',
        ),
        ManagedPolicy.fromAwsManagedPolicyName(
          'AWSBackupServiceRolePolicyFors3Backup',
        ),
        ManagedPolicy.fromAwsManagedPolicyName('AmazonS3FullAccess'),
      ],
    });

    // --- KMS Key -------

    const backupKmsKey = new Key(this, 'BackupKmsKey', {
      description: `${resourcePrefix}-backup encryption key`,
      enableKeyRotation: true,
      rotationPeriod: Duration.days(90),
      pendingWindow: Duration.days(30),
      removalPolicy: getRemovalPolicy(environment),
      alias: `${resourcePrefix}-backup`,
    });

    backupKmsKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowAccountAdmin',
        effect: Effect.ALLOW,
        principals: [new AccountRootPrincipal()],
        actions: ['kms:*'],
        resources: ['*'],
      }),
    );

    backupKmsKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowBackupService',
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal('backup.amazonaws.com')],
        actions: [
          'kms:Encrypt',
          'kms:Decrypt',
          'kms:ReEncrypt*',
          'kms:GenerateDataKey*',
          'kms:DescribeKey',
          'kms:CreateGrant',
        ],
        resources: ['*'],
      }),
    );

    backupKmsKey.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowSNSService',
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal('sns.amazonaws.com')],
        actions: ['kms:Decrypt', 'kms:GenerateDataKey*'],
        resources: ['*'],
      }),
    );

    // --- SNS Notificaiotn Topic -------------------

    const notificationTopic = new Topic(this, 'BackupNotificationTopic', {
      topicName: `${resourcePrefix}-backup-notifications`,
      masterKey: backupKmsKey,
    });

    notificationTopic.addToResourcePolicy(
      new PolicyStatement({
        sid: 'AllowBackupPublish',
        effect: Effect.ALLOW,
        principals: [new ServicePrincipal('backup.amazonaws.com')],
        actions: ['sns:Publish'],
        resources: [notificationTopic.topicArn],
      }),
    );

    if (notificationEmail) {
      notificationTopic.addSubscription(
        new EmailSubscription(notificationEmail),
      );
    }

    // --- Backup Vault ---------------------------

    const backupVault = new BackupVault(this, 'BackupVault', {
      backupVaultName: `${resourcePrefix}-backup-vault`,
      encryptionKey: backupKmsKey,
      removalPolicy: getRemovalPolicy(environment),
      accessPolicy: new PolicyDocument({
        statements: [
          new PolicyStatement({
            sid: 'AllowInfraBackupRole',
            effect: Effect.ALLOW,
            principals: [new ArnPrincipal(backupRole.roleArn)],
            actions: [
              'backup:CopyIntoBackupVault',
              'backup:CopyFromBackupVault',
            ],
            resources: ['*'],
          }),
        ],
      }),
      notificationTopic,
      notificationEvents: [
        BackupVaultEvents.BACKUP_JOB_FAILED,
        BackupVaultEvents.COPY_JOB_FAILED,
        BackupVaultEvents.S3_BACKUP_OBJECT_FAILED,
      ],
    });

    const cfVault = backupKmsKey.node.defaultChild as CfnBackupVault;
    cfVault.lockConfiguration = {
      changeableForDays: 3,
      minRetentionDays: 30,
    };

    const dailyRule = (ruleName: string): BackupPlanRule =>
      new BackupPlanRule({
        ruleName,
        backupVault,
        scheduleExpression: Schedule.cron({
          hour: '5',
          minute: '0',
        }),
        deleteAfter: Duration.days(35),
      });

    const monthly1YearRule = (ruleName: string): BackupPlanRule =>
      new BackupPlanRule({
        ruleName,
        backupVault,
        scheduleExpression: Schedule.cron({
          hour: '5',
          minute: '0',
          day: '1',
        }),
        deleteAfter: Duration.days(365),
        moveToColdStorageAfter: Duration.days(30),
      });

    const monthly5YearRule = (ruleName: string): BackupPlanRule =>
      new BackupPlanRule({
        ruleName,
        backupVault,
        scheduleExpression: Schedule.cron({
          hour: '5',
          minute: '0',
          day: '1',
        }),
        deleteAfter: Duration.days(1825),
        moveToColdStorageAfter: Duration.days(90),
      });

    // short plan daily only
    const shortPlan = new BackupPlan(this, 'ShortBackupPlan', {
      backupPlanName: `${resourcePrefix}-backup-short`,
      backupPlanRules: [dailyRule('Daily')],
    });

    const mediumPlan = new BackupPlan(this, 'MediumBackupPlan', {
      backupPlanName: `${resourcePrefix}-backup-medium`,
      backupPlanRules: [dailyRule('Daily'), monthly1YearRule('Monthly1Year')],
    });

    const longPlan = new BackupPlan(this, 'LongBackupPlan', {
      backupPlanName: `${resourcePrefix}-backup-long`,
      backupPlanRules: [
        dailyRule('Daily'),
        monthly1YearRule('Monthly1Year'),
        monthly5YearRule('Monthly5Year'),
      ],
    });

    mediumPlan.addSelection('DefaultSelection', {
      backupSelectionName: `${resourcePrefix}-backup-default`,
      role: backupRole,
      resources: [
        BackupResource.fromArn('arn:aws:dynamodb:*:*:table/*'),
        BackupResource.fromArn('arn:aws:rds:*:*:db:*'),
      ],
    });

    const tagSelections: { plan: BackupPlan; tag: string }[] = [
      { plan: shortPlan, tag: 'short' },
      { plan: mediumPlan, tag: 'medium' },
      { plan: longPlan, tag: 'long' },
    ];

    for (const { plan, tag } of tagSelections) {
      plan.addSelection(`TagSelection-${tag}`, {
        backupSelectionName: `${resourcePrefix}-backup-tag-${tag}`,
        role: backupRole,
        resources: [BackupResource.fromTag('backup-plan', tag)],
      });
    }
  }
}
