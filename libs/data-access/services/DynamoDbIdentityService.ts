import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  IdentityLinkingInvalidIdentitesError,
  IdentityRecordNotFoundError,
  Logger,
  UDP_ERROR_TYPES,
} from '@libs/utils';
import { v4 as uuidv4 } from 'uuid';
import {
  CreateUserInput,
  CreateUserResult,
  EncryptionConfig,
  IdentityInput,
  IdentityRecordEntity,
} from '../types/Entity';
import { decryptItem, encryptItem } from './crypto';

const SK_INDEX = 'sk-index';

/**
 * Reads and writes identity records in DynamoDB.
 *
 * Identities are keyed by `{service}#{id}` (partition) and the shared udpId
 * (sort), with a `sk-index` GSI for reverse lookups by udpId. Token fields are
 * encrypted at rest when the factory is configured with a KMS key.
 */
export class DynamoDBIdentityService {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly encryption?: EncryptionConfig,
    private readonly logger?: Logger,
  ) {}

  public async linkIdentity(input: IdentityInput) {
    if (input.appId === input.serviceId) {
      throw new IdentityLinkingInvalidIdentitesError(
        'The provided AppId and ServiceId for linking should not be the same value',
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        input.appId,
        input.serviceId,
      );
    }

    const app = await this.getByServiceId('app', input.appId);

    await this.put({
      pk: `${input.serviceName}#${input.serviceId}`,
      sk: app.udpId,
      serviceName: input.serviceName,
      serviceId: input.serviceId,
      udpId: app.udpId,
      ...(input.expiresAt ? { ttl: input.expiresAt } : {}),
    });
  }

  public async createAppUser(
    input: CreateUserInput,
  ): Promise<CreateUserResult> {
    const pk = `app#${input.appId}`;

    if (await this.findByPk(pk)) {
      this.logger?.debug('User already exists', { pk });
      return { udpId: '', created: false };
    }

    const udpId = uuidv4();

    await this.put({
      pk,
      sk: udpId,
      udpId,
      serviceId: input.appId,
      serviceName: 'app',
    });

    return { udpId, created: true };
  }

  public async getByServiceId(serviceName: string, serviceId: string) {
    const pk = `${serviceName.toLowerCase()}#${serviceId}`;
    const user = await this.findByPk(pk);

    if (!user) {
      throw this.notFound(serviceName, serviceId);
    }

    return user;
  }

  public async deleteById(serviceName: string, serviceId: string) {
    const identity = await this.getByServiceId(serviceName, serviceId);
    const result = await this.delete(identity.pk, identity.sk);

    if (!result) {
      throw this.notFound(serviceName, serviceId);
    }

    return result;
  }

  public async deleteAllByUdpId(udpId: string): Promise<number> {
    const identities = await this.queryBySk(udpId);

    if (identities.length === 0) {
      this.logger?.debug(`No linked identities found for UDPID ${udpId}`);
      return 0;
    }

    let deletedCount = 0;

    for (const identity of identities) {
      try {
        await this.delete(identity.pk, identity.sk);
        deletedCount++;
      } catch (error) {
        if (error.name === 'ConditionalCheckFailedException') {
          this.logger?.warn('Identity not found during bulk delete', {
            udpId,
            pk: identity.pk,
            sk: identity.sk,
          });
        } else {
          throw error;
        }
      }
    }

    return deletedCount;
  }

  public async getLinkedIdentity(
    serviceName: string,
    serviceId: string,
    requiredService: string,
  ) {
    const identity = await this.getByServiceId(serviceName, serviceId);
    const linked = await this.queryLinked(identity.udpId, requiredService);

    if (!linked) {
      throw new IdentityRecordNotFoundError(
        `Linked identity not found for service ${requiredService}`,
        UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
        requiredService,
        serviceId,
      );
    }

    return linked;
  }

  public async getAllLinkedServices(
    serviceName: string,
    serviceId: string,
  ): Promise<string[]> {
    const identity = await this.getByServiceId(serviceName, serviceId);
    const identities = await this.queryBySk(identity.udpId);
    const linkedServices = identities
      .map((identity) => {
        if (identity.ttl && identity.ttl < this.getCurrentTTL()) {
          return 'expired';
        }
        return identity.serviceName;
      })
      .filter((service) => service !== 'expired');

    if (linkedServices.length === 0) {
      this.logger?.debug(`No linked service found for UDPID ${identity.udpId}`);
    }

    return linkedServices;
  }

  // --- DynamoDB access ---

  private async findByPk(pk: string): Promise<IdentityRecordEntity | null> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        Limit: 1,
      }),
    );

    const item = response.Items?.[0];
    if (!item || item.ttl < this.getCurrentTTL()) {
      return null;
    }

    return decryptItem<IdentityRecordEntity>(item, this.encryption);
  }

  private async queryBySk(sk: string): Promise<IdentityRecordEntity[]> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: SK_INDEX,
        KeyConditionExpression: 'sk = :sk',
        ExpressionAttributeValues: { ':sk': sk },
      }),
    );

    return (response.Items ?? []) as IdentityRecordEntity[];
  }

  private async queryLinked(
    udpId: string,
    servicePrefix: string,
  ): Promise<IdentityRecordEntity | null> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        IndexName: SK_INDEX,
        KeyConditionExpression: 'sk = :sk AND begins_with(pk, :pkPrefix)',
        ExpressionAttributeValues: {
          ':sk': udpId,
          ':pkPrefix': `${servicePrefix}#`,
        },
      }),
    );

    const item = response.Items?.[0];
    if (!item) {
      return null;
    }

    return decryptItem<IdentityRecordEntity>(item, this.encryption);
  }

  private async put(entity: IdentityRecordEntity) {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: await encryptItem(entity, this.encryption),
      }),
    );
  }

  private async delete(pk: string, sk: string): Promise<boolean | null> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk, sk },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  private notFound(serviceName: string, serviceId: string) {
    return new IdentityRecordNotFoundError(
      `Identity not found with service: ${serviceName} and id: ${serviceId}`,
      UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
      serviceName,
      serviceId,
    );
  }

  private getCurrentTTL() {
    return Math.floor(Date.now() / 1000);
  }
}
