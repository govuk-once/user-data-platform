import { DynamoDBEntity, EncryptionConfig } from '../types/Entity';
import { Repository } from './Repository';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { GetError, SaveError, DeleteError } from '../errors/Errors';
import { Logger } from '@libs/utils';
import { EncryptedData } from '../services/EncryptionService';

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

  /**
   * Retrieves an entity by its key(s) from DynamoDB.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   * @throws {GetError} When the DynamoDB operation fails or required keys are missing
   */
  async get(keys: Partial<T>): Promise<T | null> {
    if (
      !('pk' in keys) ||
      !('sk' in keys) ||
      keys.pk === undefined ||
      keys.sk === undefined
    ) {
      throw new GetError(
        'item',
        JSON.stringify(keys),
        new Error('Both pk and sk are required for composite key entities'),
      );
    }

    const { pk, sk } = keys as { pk: string; sk: string };

    this.logger?.debug('Getting item from DynamoDB', {
      operation: 'get',
      tableName: this.tableName,
      pk,
      sk,
    });

    try {
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
    } catch (error) {
      this.logger?.error('Failed to get item from DynamoDB', {
        operation: 'get',
        tableName: this.tableName,
        pk,
        sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new GetError('item', `${pk}#${sk}`, error as Error);
    }
  }

  /**
   * Saves an entity to DynamoDB.
   * If an entity with the same key(s) exists, it will be overwritten.
   * Undefined values are automatically removed from the entity before saving.
   * @param entity - The entity to save
   * @returns A promise that resolves when the save operation is complete
   * @throws {SaveError} When the DynamoDB operation fails
   */
  async save(entity: T): Promise<void> {
    this.logger?.debug('Saving item to DynamoDB', {
      operation: 'save',
      tableName: this.tableName,
      pk: entity.pk,
      sk: entity.sk,
      hasTtl: entity.ttl !== undefined,
    });

    try {
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
    } catch (error) {
      this.logger?.error('Failed to save item to DynamoDB', {
        operation: 'save',
        tableName: this.tableName,
        pk: entity.pk,
        sk: entity.sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new SaveError('item', `${entity.pk}#${entity.sk}`, error as Error);
    }
  }

  /**
   * Retrieves an entity by its key(s) from DynamoDB.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves when the delete operation is complete
   * @throws {DeleteError} When the DynamoDB operation fails or required keys are missing
   */
  async delete(keys: Partial<T>): Promise<void> {
    if (
      !('pk' in keys) ||
      !('sk' in keys) ||
      keys.pk === undefined ||
      keys.sk === undefined
    ) {
      throw new DeleteError(
        'item',
        JSON.stringify(keys),
        new Error('Both pk and sk are required for composite key entities'),
      );
    }

    const { pk, sk } = keys as { pk: string; sk: string };

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
      });

      await this.client.send(command);

      this.logger?.debug('Item deleted successfully', { pk, sk });
    } catch (error) {
      this.logger?.error('Failed to delete item from DynamoDB', {
        operation: 'get',
        tableName: this.tableName,
        pk,
        sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new DeleteError('item', `${pk}#${sk}`, error as Error);
    }
  }
}
