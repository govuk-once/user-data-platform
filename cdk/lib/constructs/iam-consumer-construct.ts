import { Annotations, CfnOutput, Stack } from 'aws-cdk-lib';
import { RestApi } from 'aws-cdk-lib/aws-apigateway';
import {
  AccountPrincipal,
  ArnPrincipal,
  Effect,
  IPrincipal,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import { GovUKTag } from '@govuk-connect/tag';

export type Permission = 'read' | 'write' | 'delete';

export interface IamConsumerConfig {
  readonly permissions: Permission[];
  readonly accountId?: string;
  /**
   * Specific principals (e.g. role ARNs) in the consumer account that may
   * assume the consumer role. When omitted, the whole consumer account
   * (`:root`) is trusted, which ITHC flags as overly broad.
   */
  readonly principalArns?: string[];
  readonly externalId?: string;
  readonly description?: string;
}

export interface IamConsumerConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly api: RestApi;
  readonly consumers: Record<string, IamConsumerConfig>;
}

const PERMISSIONS_TO_METHODS: Record<Permission, string[]> = {
  read: ['GET'],
  write: ['POST', 'PUT', 'PATCH'],
  delete: ['DELETE'],
};

export class IamConsumerConstruct extends Construct {
  public readonly consumerRoles: Map<string, Role> = new Map();

  constructor(scope: Construct, id: string, props: IamConsumerConstructProps) {
    super(scope, id);

    const { developerId, environment, api, consumers } = props;

    const stack = Stack.of(this);
    const resourcePrefix = developerId
      ? `${developerId}-${environment}`
      : environment;

    for (const [consumerName, consumerConfig] of Object.entries(consumers)) {
      const roleName = `${resourcePrefix}-consumer-${consumerName}-role`;

      const [trustPrincipal, ...additionalTrustPrincipals] =
        consumerConfig.accountId
          ? this.createCrossAccountTrustPrincipals(
              consumerConfig.accountId,
              consumerConfig.principalArns,
              consumerConfig.externalId,
            )
          : [new ServicePrincipal('codebuild.amazonaws.com')];

      const role = new Role(this, `ConsumerRole-${consumerName}`, {
        roleName,
        assumedBy: trustPrincipal,
        description:
          consumerConfig.description ||
          `API Consumer role for  ${consumerName} = ${environment}`,
      });

      for (const principal of additionalTrustPrincipals) {
        role.assumeRolePolicy?.addStatements(
          new PolicyStatement({
            effect: Effect.ALLOW,
            actions: ['sts:AssumeRole'],
            principals: [principal],
          }),
        );
      }

      if (consumerConfig.accountId && !consumerConfig.principalArns?.length) {
        Annotations.of(role).addWarning(
          `Consumer ${consumerName} trusts the whole account ${consumerConfig.accountId}; set principalArns to restrict the trust policy to specific roles`,
        );
      }

      const apiResources = this.buildApiResourceArns(
        stack,
        api,
        consumerConfig.permissions,
      );

      role.addToPolicy(
        new PolicyStatement({
          sid: 'AllowApiGatewayInvoke',
          effect: Effect.ALLOW,
          actions: [`execute-api:Invoke`],
          resources: apiResources,
        }),
      );
      GovUKTag.of(role).DataClassification.OFFICIAL_SENSITIVE();

      this.consumerRoles.set(consumerName, role);

      new CfnOutput(this, `ConsumerRoleArns-${consumerName}`, {
        value: role.roleArn,
        description: `IAM Role ARN for consumer ${consumerName}`,
        exportName: `${stack.stackName}-ConsumerRoleArn-${consumerName}`,
      });

      new CfnOutput(this, `ConsumerRoleName-${consumerName}`, {
        value: role.roleName,
        description: `IAM Role name for consumer ${consumerName}`,
        exportName: `${stack.stackName}-ConsumerRoleName-${consumerName}`,
      });
    }
  }

  private createCrossAccountTrustPrincipals(
    accountId: string,
    principalArns: string[] | undefined,
    externalId?: string,
  ): IPrincipal[] {
    const principals = consumerAccountPrincipals(accountId, principalArns);

    if (!externalId) {
      return principals;
    }

    return principals.map((principal) =>
      principal.withConditions({
        StringEquals: {
          'sts:ExternalId': externalId,
        },
      }),
    );
  }

  private buildApiResourceArns(
    stack: Stack,
    api: RestApi,
    permissions: Permission[],
  ): string[] {
    const resources: string[] = [];

    for (const permission of permissions) {
      const methods = PERMISSIONS_TO_METHODS[permission];
      for (const method of methods) {
        resources.push(
          `arn:aws:execute-api:${stack.region}:${stack.account}:${api.restApiId}/*/${method}/*`,
        );
      }
    }

    return resources;
  }
}

/**
 * Guard against a typo in config granting a principal from a different
 * account than the one the consumer was registered with.
 */
export function assertPrincipalInAccount(arn: string, accountId: string) {
  const arnAccount = arn.split(':')[4];
  if (arnAccount !== accountId) {
    throw new Error(
      `Consumer principal ${arn} is not in consumer account ${accountId}`,
    );
  }
}

/**
 * Principals in the consumer account that resource policies (KMS key,
 * Secrets Manager secret) should grant: the specific principals when
 * configured, otherwise the whole account.
 */
export function consumerAccountPrincipals(
  accountId: string,
  principalArns?: string[],
): IPrincipal[] {
  return principalArns?.length
    ? principalArns.map((arn) => {
        assertPrincipalInAccount(arn, accountId);
        return new ArnPrincipal(arn);
      })
    : [new AccountPrincipal(accountId)];
}
