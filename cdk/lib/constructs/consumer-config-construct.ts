import { CfnOutput, SecretValue } from 'aws-cdk-lib';
import { UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { AccountPrincipal, Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Secret } from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

export interface ExternalConsumerConfig {
  readonly accountId: string;
  readonly scopes: string[];
  readonly description?: string;
}

export interface ConsumerConfigProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly region: string;
  readonly accountId: string;
  readonly privateLinkServiceName?: string;
  readonly availabilityZones: string[];
  readonly cognitoTokenEndpoint: string;
  readonly cognitoUserPoolId: string;
  readonly m2mClients: Map<string, UserPoolClient>;
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
      cognitoTokenEndpoint,
      cognitoUserPoolId,
      m2mClients,
      externalConsumers,
      apiUrl,
    } = props;

    const secretPathPrefix = developerId
      ? `/udp/${developerId}/${environment}`
      : `/udp/${environment}`;

    for (const [consumerName, consumerConfig] of Object.entries(
      externalConsumers,
    )) {
      const m2mClient = m2mClients.get(consumerName);

      if (!m2mClient) {
        throw new Error(
          `External conumer ${consumerName} does not have a matching M2M client`,
        );
      }

      const secret = new Secret(this, `secret-${consumerName}`, {
        secretName: `${secretPathPrefix}/consumers/${consumerName}/config`,
        description: `Api configuration for external consumer ${consumerName}`,
        secretObjectValue: {
          privateLinkServiceName: SecretValue.unsafePlainText(
            privateLinkServiceName ?? 'NOT_ENABLED',
          ),
          region: SecretValue.unsafePlainText(region),
          apiAccountId: SecretValue.unsafePlainText(accountId),
          apiUrl: SecretValue.unsafePlainText(apiUrl),
          availabilityZones: SecretValue.unsafePlainText(
            JSON.stringify(availabilityZones),
          ),
          cognitoTokenEndpoint:
            SecretValue.unsafePlainText(cognitoTokenEndpoint),
          cognitoUserPoolId: SecretValue.unsafePlainText(cognitoUserPoolId),
          cognitoClientId: SecretValue.unsafePlainText(
            m2mClient.userPoolClientId,
          ),
          cognitoClientSecret: m2mClient.userPoolClientSecret,
        },
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
        description: `Secret Arn for external consumer ${consumerName}`,
      });

      new CfnOutput(this, `ConsumerSecretName-${consumerName}`, {
        value: secret.secretName,
        description: `Secret Name for external consumer ${consumerName}`,
      });
    }
  }
}
