import { DynamoDBEntity, EncryptionConfig } from '../types/Entity';
import { Repository } from './Repository';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { InvalidDynamoKeyError, Logger, UDP_ERROR_TYPES } from '@libs/utils';
import { EncryptedData } from '../services/EncryptionService';
import { debug } from 'console';

/**
 * DynamoDB repository implementation for composite key (pk/sk) entities.
 * Designed for single-table design pattern with partition key (pk) and sort key (sk).
 * Stores entities in an AWS DynamoDB table using the AWS SDK v3 Document Client.
 * Automatically handles type conversion between JavaScript and DynamoDB.
 * @template T - The entity type that extends DynamoDBEntity
 */
export class DynamoDBRepository<T extends DynamoDBEntity>
  implements Repository<T>
{
  private readonly client: DynamoDBDocumentClient;
  private readonly tableName: string;
  private readonly encryption?: EncryptionConfig;
  private readonly logger?: Logger;

  /**
   * Creates a new DynamoDB repository instance.
   * @param tableName - The name of the DynamoDB table to use
   * @param client - DynamoDB Document Client instance (should be created outside constructor for Lambda performance)
   */
  constructor(
    tableName: string,
    client: DynamoDBDocumentClient,
    encryption?: EncryptionConfig,
    logger?: Logger,
  ) {
    this.tableName = tableName;
    this.client = client;
    this.encryption = encryption;
    this.logger = logger;
  }

  validateKeys(keys: Partial<T>): { pk: string; sk: string } {
    if (
      !('pk' in keys) ||
      !('sk' in keys) ||
      keys.pk === undefined ||
      keys.sk === undefined
    ) {
      throw new InvalidDynamoKeyError(
        'Both pk and sk are required for composite key entities',
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        keys.pk,
        keys.sk,
      );
    }

    return keys as { pk: string; sk: string };
  }

  /**
   * Retrieves an entity by its key(s) from DynamoDB.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   */
  async get(keys: Partial<T>): Promise<T | null> {
    const { pk, sk } = this.validateKeys(keys);

    this.logger?.debug('Getting item from DynamoDB', {
      operation: 'get',
      tableName: this.tableName,
      pk,
      sk,
    });

    const command = new GetCommand({
      TableName: this.tableName,
      Key: { pk, sk },
    });

    const response = await this.client.send(command);

    if (!response.Item) {
      this.logger?.debug('Item not found', { pk, sk });
      return null;
    }

    this.logger?.debug('Item retrieved successfully', { pk, sk });

    return this.encryption
      ? ((await this.encryption.service.decryptFields(
          response.Item as Record<string, unknown> & EncryptedData,
          this.encryption.dataFields,
        )) as T)
      : (response.Item as T);
  }

  async getByPk(pk: string): Promise<T | null> {
    this.logger?.debug('Checking existence by pk', {
      pk,
      tableName: this.tableName,
      operation: 'getByPk',
    });

    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: {
        ':pk': pk,
      },
      Limit: 1,
    });

    const response = await this.client.send(command);

    if (!response.Items || response.Items.length === 0) {
      this.logger?.debug('Item not found', { pk });
      return null;
    }

    const item = response.Items[0];

    this.logger?.debug('Checking data by pk', {
      item,
      tableName: this.tableName,
      operation: 'getByPk',
    });

    return this.encryption
      ? ((await this.encryption.service.decryptFields(
          item as Record<string, unknown> & EncryptedData,
          this.encryption.dataFields,
        )) as T)
      : (item as T);
  }

  /**
   * Retrieves an entity by its key(s) from DynamoDB.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   */
  async skBeginswith(keys: Partial<T>): Promise<T | null> {
    const { pk, sk } = this.validateKeys(keys);

    this.logger?.debug('Getting item from DynamoDB', {
      operation: 'get',
      tableName: this.tableName,
      pk,
      sk,
    });

    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk AND begins_with(sk, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': pk,
        ':skPrefix': sk,
      },
      Limit: 1,
    });

    const response = await this.client.send(command);

    if (!response.Items || response.Items.length < 1) {
      this.logger?.debug('Item not found', { pk, sk });
      return null;
    }

    this.logger?.debug('Item retrieved successfully', { pk, sk });

    const firstItem = response.Items[0];

    if (!firstItem) {
      this.logger?.debug('Item not found', { pk, sk });
      return null;
    }

    return this.encryption
      ? ((await this.encryption.service.decryptFields(
          firstItem as Record<string, unknown> & EncryptedData,
          this.encryption.dataFields,
        )) as T)
      : (firstItem as unknown as T);
  }

  async countByPk(pk: string): Promise<number> {
    this.logger?.debug('Counting items by pk', {
      operation: 'countByPk',
      tableName: this.tableName,
      pk,
    });

    let totalCount = 0;
    let exclusiveStartKey: Record<string, unknown> | undefined;

    do {
      const command = new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        Select: 'COUNT',
        ...(exclusiveStartKey
          ? {
              ExclusiveStartKey: exclusiveStartKey,
            }
          : {}),
      });

      const response = await this.client.send(command);
      totalCount += response.Count ?? 0;
      exclusiveStartKey = response.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined;
    } while (exclusiveStartKey);

    this.logger?.debug('Count completed', { pk, totalCount });
    return totalCount;
  }

  async queryPageByPk(
    pk: string,
    limit: number,
    exclusiveStartKey?: Record<string, number>,
  ): Promise<{
    items: Array<{ pk: string; sk: string }>;
    lastEvaluatedKey?: Record<string, unknown>;
  }> {
    this.logger?.debug('Query page by pk', {
      operation: 'queryPageByPk',
      tableName: this.tableName,
      pk,
      limit,
    });

    const command = new QueryCommand({
      TableName: this.tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: { ':pk': pk },
      Limit: limit,
      ProjectionExpression: 'pk, sk',
      ...(exclusiveStartKey ? { ExclusiveStartKey: exclusiveStartKey } : {}),
    });

    const response = await this.client.send(command);

    const items = (response.Items ?? []).map((item) => ({
      pk: item.pk as string,
      sk: item.sk as string,
    }));

    this.logger?.debug('Page query completed', {
      pk,
      itemCount: items.length,
    });

    return {
      items,
      lastEvaluatedKey: response.LastEvaluatedKey as
        | Record<string, unknown>
        | undefined,
    };
  }

  /**
   * Saves an entity to DynamoDB.
   * If an entity with the same key(s) exists, it will be overwritten.
   * Undefined values are automatically removed from the entity before saving.
   * @param entity - The entity to save
   * @returns A promise that resolves when the save operation is complete
   */
  async save(entity: T): Promise<T> {
    this.logger?.debug('Saving item to DynamoDB', {
      operation: 'save',
      tableName: this.tableName,
      pk: entity.pk,
      sk: entity.sk,
      hasTtl: entity.ttl !== undefined,
    });

    const itemToStore = this.encryption
      ? await this.encryption.service.encryptFields(
          entity as Record<string, unknown>,
          this.encryption.dataFields,
        )
      : entity;

    const command = new PutCommand({
      TableName: this.tableName,
      Item: itemToStore,
    });

    await this.client.send(command);

    this.logger?.debug('Item saved successfully', {
      pk: entity.pk,
      sk: entity.sk,
    });

    return entity;
  }

  /**
   * Retrieves an entity by its key(s) from DynamoDB.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves when the delete operation is complete
   */
  async delete(keys: Partial<T>): Promise<boolean | null> {
    const { pk, sk } = this.validateKeys(keys);

    this.logger?.debug('Deleting item from DynamoDB', {
      operation: 'get',
      tableName: this.tableName,
      pk,
      sk,
    });

    try {
      const command = new DeleteCommand({
        TableName: this.tableName,
        Key: { pk, sk },
        ConditionExpression: 'attribute_exists(pk)',
      });

      await this.client.send(command);
      this.logger?.debug('Item deleted successfully', { pk, sk });
      return true;
    } catch (error) {
      if (error.name === 'ConditionalCheckFailedException') {
        return null;
      }

      throw error;
    }
  }
}
