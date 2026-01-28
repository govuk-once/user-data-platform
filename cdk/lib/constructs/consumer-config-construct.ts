import { CfnOutput, SecretValue } from 'aws-cdk-lib';
import {
  AccountPrincipal,
  Effect,
  PolicyStatement,
  Role,
} from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ExternalConsumerConfig {
  readonly accountId: string;
  readonly permissions: ('read' | 'write' | 'delete')[];
  readonly externalId?: string;
  readonly description?: string;
}

export interface ConsumerConfigProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly region: string;
  readonly accountId: string;
  readonly privateLinkServiceName?: string;
  readonly availabilityZones: string[];
  readonly consumerRoles: Map<string, Role>;
  readonly externalConsumers: Record<string, ExternalConsumerConfig>;
  readonly apiUrl: string;
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
      privateLinkServiceName,
      availabilityZones,
      consumerRoles,
      externalConsumers,
      apiUrl,
    } = props;

    const secretPathPrefix = developerId
      ? `/udp/${developerId}/${environment}`
      : `/udp/${environment}`;

    for (const [consumerName, consumerConfig] of Object.entries(
      externalConsumers,
    )) {
      const consumerRole = consumerRoles.get(consumerName);

      if (!consumerRole) {
        throw new Error(
          `External conumer ${consumerName} does not have a matching IAM Consumer Role`,
        );
      }

      const secretValue: Record<string, SecretValue> = {
        privateLinkServiceName: SecretValue.unsafePlainText(
          privateLinkServiceName ?? 'NOT_ENABLED',
        ),
        region: SecretValue.unsafePlainText(region),
        apiAccountId: SecretValue.unsafePlainText(accountId),
        apiUrl: SecretValue.unsafePlainText(apiUrl),
        availabilityZones: SecretValue.unsafePlainText(
          JSON.stringify(availabilityZones),
        ),
        consumerRoleArn: SecretValue.unsafePlainText(consumerRole.roleArn),
      };

      if (consumerConfig.externalId) {
        secretValue.externalId = SecretValue.unsafePlainText(
          consumerConfig.externalId,
        );
      }

      const secret = new Secret(this, `secret-${consumerName}`, {
        secretName: `${secretPathPrefix}/consumers/${consumerName}/config`,
        description: `Api configuration for external consumer ${consumerName}`,
        secretObjectValue: secretValue,
      });

      secret.addToResourcePolicy(
        new PolicyStatement({
          sid: `AllowCrossAccountRead-${consumerName}`,
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
