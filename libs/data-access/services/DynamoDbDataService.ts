import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DataRecordNotFoundError, Logger, UDP_ERROR_TYPES } from '@libs/utils';
import {
  DataInput,
  DynamoDBDataEntity,
  EncryptionConfig,
  IdentityRecordEntity,
} from '../types/Entity';
import { decryptItem, encryptItem } from './crypto';

const PAGE_SIZE = 100;

/**
 * Reads and writes user data records in DynamoDB.
 *
 * Records use the identity's udpId as the partition key and the resource path
 * as the sort key. The `data` field is encrypted at rest when the factory is
 * configured with a KMS key.
 */
export class DynamoDbDataService {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly encryption?: EncryptionConfig,
    private readonly logger?: Logger,
  ) {}

  public async save(
    identity: IdentityRecordEntity,
    resourcePath: string,
    input: DataInput,
  ): Promise<DynamoDBDataEntity> {
    const entity = this.buildEntity(identity, resourcePath, input);

    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: await encryptItem(entity, this.encryption),
      }),
    );

    return entity;
  }

  public async getByKey(identity: IdentityRecordEntity, resourcePath: string) {
    const entity = await this.findByKey(identity.udpId, resourcePath);

    if (!entity) {
      throw this.notFound(identity, resourcePath);
    }

    return entity;
  }

  public async patchByKey(
    identity: IdentityRecordEntity,
    resourcePath: string,
    data: Record<string, unknown>,
  ) {
    const existing = await this.findByKey(identity.udpId, resourcePath);

    if (!existing) {
      throw this.notFound(identity, resourcePath);
    }

    const merged = deepMerge(existing.data ?? {}, data);

    return this.update(identity.udpId, resourcePath, merged);
  }

  public async deleteByKey(
    identity: IdentityRecordEntity,
    resourcePath: string,
  ) {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk: identity.udpId, sk: resourcePath },
          ConditionExpression: 'attribute_exists(pk)',
        }),
      );
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        throw this.notFound(identity, resourcePath);
      }
      throw error;
    }
  }

  public async countByUdpID(udpId: string): Promise<number> {
    let total = 0;
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': udpId },
          Select: 'COUNT',
          ...(exclusiveStartKey
            ? { ExclusiveStartKey: exclusiveStartKey }
            : {}),
        }),
      );
      total += response.Count ?? 0;
      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return total;
  }

  public async getKeyPageByUdpID(
    udpId: string,
    exclusiveStartKey?: Record<string, unknown>,
  ): Promise<{
    items: Array<{ pk: string; sk: string }>;
    lastEvaluatedKey?: Record<string, unknown>;
  }> {
    const response = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': udpId },
        Limit: PAGE_SIZE,
        ProjectionExpression: 'pk, sk',
        ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
      }),
    );

    return {
      items: (response.Items ?? []).map((item) => ({
        pk: item.pk as string,
        sk: item.sk as string,
      })),
      lastEvaluatedKey: response.LastEvaluatedKey,
    };
  }

  public async getAllByUdpID(udpId: string): Promise<DynamoDBDataEntity[]> {
    const items: DynamoDBDataEntity[] = [];
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const response = await this.client.send(
        new QueryCommand({
          TableName: this.tableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: { ':pk': udpId },
          ...(exclusiveStartKey
            ? { ExclusiveStartKey: exclusiveStartKey }
            : {}),
        }),
      );

      for (const item of response.Items ?? []) {
        items.push(
          await decryptItem<DynamoDBDataEntity>(item, this.encryption),
        );
      }

      exclusiveStartKey = response.LastEvaluatedKey;
    } while (exclusiveStartKey);

    return items;
  }

  private async findByKey(
    pk: string,
    sk: string,
  ): Promise<DynamoDBDataEntity | null> {
    const response = await this.client.send(
      new GetCommand({ TableName: this.tableName, Key: { pk, sk } }),
    );

    if (!response.Item) {
      return null;
    }

    return decryptItem<DynamoDBDataEntity>(response.Item, this.encryption);
  }

  private async update(
    pk: string,
    sk: string,
    data: Record<string, unknown>,
  ): Promise<DynamoDBDataEntity | null> {
    const stored = this.encryption
      ? await this.encryption.service.encryptFields(
          { data },
          this.encryption.dataFields,
        )
      : { data };

    try {
      const response = await this.client.send(
        new UpdateCommand({
          TableName: this.tableName,
          Key: { pk, sk },
          UpdateExpression: this.encryption
            ? 'SET #data = :data, #dataKey = :dataKey'
            : 'SET #data = :data',
          ExpressionAttributeNames: {
            '#data': 'data',
            ...(this.encryption ? { '#dataKey': '__dataKey' } : {}),
          },
          ExpressionAttributeValues: {
            ':data': (stored as Record<string, unknown>).data,
            ...(this.encryption
              ? { ':dataKey': (stored as Record<string, unknown>).__dataKey }
              : {}),
          },
          ConditionExpression: 'attribute_exists(pk)',
          ReturnValues: 'ALL_NEW',
        }),
      );

      return decryptItem<DynamoDBDataEntity>(
        response.Attributes ?? {},
        this.encryption,
      );
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return null;
      }
      throw error;
    }
  }

  private buildEntity(
    identity: IdentityRecordEntity,
    resourcePath: string,
    input: DataInput,
  ): DynamoDBDataEntity {
    const ttl = input.configuration?.expiresAt ?? undefined;

    return {
      pk: identity.udpId,
      sk: resourcePath,
      ...(input.data ? { data: input.data } : {}),
      ...(ttl ? { ttl } : {}),
    };
  }

  private notFound(identity: IdentityRecordEntity, resourcePath: string) {
    return new DataRecordNotFoundError(
      `Resource not found on path ${resourcePath}: for identity ${identity.serviceName}#${identity.serviceId}`,
      UDP_ERROR_TYPES.DATA_NOT_FOUND,
      identity.serviceName,
      identity.serviceId,
      resourcePath,
    );
  }
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target };

  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];

    result[key] =
      isPlainObject(sourceVal) && isPlainObject(targetVal)
        ? deepMerge(targetVal, sourceVal)
        : sourceVal;
  }

  return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
