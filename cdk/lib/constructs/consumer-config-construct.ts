import { CfnOutput, SecretValue } from 'aws-cdk-lib';
import {
  AccountPrincipal,
  Effect,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import { Key } from 'aws-cdk-lib/aws-kms';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { GovUKTag } from '../gov-uk-tag';

export interface ExternalConsumerConfig {
  readonly accountId: string;
  readonly permissions: ('read' | 'write' | 'delete')[];
  readonly externalId?: string;
  readonly description?: string;
  readonly rateLimit?: number;
  readonly burstLimit?: number;
}

export interface ConsumerConfigProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly region: string;
  readonly accountId: string;
  readonly consumerRoles: Map<string, Role>;
  readonly externalConsumers: Record<string, ExternalConsumerConfig>;
  readonly apiUrl: string;
  readonly apiKeyValues?: Map<string, string>;
}

export class ConsumerConfigConstruct extends Construct {
  public readonly consumerSecrets: Map<string, Secret> = new Map();

  constructor(scope: Construct, id: string, props: ConsumerConfigProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      region,
      accountId,
      consumerRoles,
      externalConsumers,
      apiUrl,
      apiKeyValues,
    } = props;

    const secretPathPrefix = developerId
      ? `/udp/${developerId}/${environment}`
      : `/udp/${environment}`;

    const key = new Key(this, 'ConsumerConfigKey', {
      alias: `alias/${secretPathPrefix}-consumer-config`,
      enableKeyRotation: true,
    });
    GovUKTag.of(key).DataClassification.OFFICIAL_SENSITIVE();

    for (const [consumerName, consumerConfig] of Object.entries(
      externalConsumers,
    )) {
      key.addToResourcePolicy(
        new PolicyStatement({
          sid: `AllowDecryptFor${consumerName.toUpperCase()}`,
          principals: [new AccountPrincipal(consumerConfig.accountId)],
          actions: ['kms:Decrypt', 'kms:DescribeKey'],
          resources: ['*'],
        }),
      );

      const consumerRole = consumerRoles.get(consumerName);

      if (!consumerRole) {
        throw new Error(
          `External consumer ${consumerName} does not have a matching IAM Consumer Role`,
        );
      }

      const secretValue: Record<string, SecretValue> = {
        region: SecretValue.unsafePlainText(region),
        apiAccountId: SecretValue.unsafePlainText(accountId),
        apiUrl: SecretValue.unsafePlainText(apiUrl),
        consumerRoleArn: SecretValue.unsafePlainText(consumerRole.roleArn),
      };

      if (consumerConfig.externalId) {
        secretValue.externalId = SecretValue.unsafePlainText(
          consumerConfig.externalId,
        );
      }
      const apiKeyValue = apiKeyValues?.get(consumerName);
      if (apiKeyValue) {
        secretValue.apiKey = SecretValue.unsafePlainText(apiKeyValue);
      }

      const secret = new Secret(this, `Secret${consumerName.toUpperCase()}`, {
        secretName: `${secretPathPrefix}/consumers/${consumerName}/config`,
        description: `Api configuration for external consumer ${consumerName}`,
        secretObjectValue: secretValue,
        encryptionKey: key,
      });
      GovUKTag.of(secret).DataClassification.OFFICIAL_SENSITIVE().PII.FALSE();

      secret.addToResourcePolicy(
        new PolicyStatement({
          sid: `AllowCrossAccountRead${consumerName.toUpperCase()}`,
          effect: Effect.ALLOW,
          principals: [new AccountPrincipal(consumerConfig.accountId)],
          actions: ['secretsmanager:GetSecretValue'],
          resources: ['*'],
        }),
      );

      this.consumerSecrets.set(consumerName, secret);

      new CfnOutput(this, `ConsumerSecretArn-${consumerName}`, {
        value: secret.secretArn,
        description: `Secret ARN for external consumer ${consumerName}`,
      });

      new CfnOutput(this, `ConsumerSecretName-${consumerName}`, {
        value: secret.secretName,
        description: `Secret Name for external consumer ${consumerName}`,
      });
    }
  }
}
