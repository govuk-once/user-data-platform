import { CompositeKeyEntity } from '../types/Entity';
import { Repository } from './Repository';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { GetByIdError, SaveError } from '../errors/Errors';
import { logger } from '../utils/Logger';


/**
 * DynamoDB repository implementation for composite key (pk/sk) entities.
 * Designed for single-table design pattern with partition key (pk) and sort key (sk).
 * Stores entities in an AWS DynamoDB table using the AWS SDK v3.
 * Uses marshall/unmarshall utilities for automatic type conversion between JavaScript and DynamoDB.
 * @template T - The entity type that extends CompositeKeyEntity
 */
export class DynamoDBRepository<T extends CompositeKeyEntity>
  implements Repository<T>
{
  private readonly client: DynamoDBClient;
  private readonly tableName: string;

  /**
   * Creates a new DynamoDB repository instance.
   * @param tableName - The name of the DynamoDB table to use
   * @param client - DynamoDB client instance (should be created outside constructor for Lambda performance)
   */
  constructor(tableName: string, client: DynamoDBClient) {
    this.tableName = tableName;
    this.client = client;
  }

  /**
   * Retrieves an entity by its key(s) from DynamoDB.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   * @throws {GetByIdError} When the DynamoDB operation fails or required keys are missing
   */
  async get(keys: Partial<T>): Promise<T | null> {
    if (!('pk' in keys) || !('sk' in keys) || keys.pk === undefined || keys.sk === undefined) {
      throw new GetByIdError(
        'item',
        JSON.stringify(keys),
        new Error('Both pk and sk are required for composite key entities')
      );
    }

    const { pk, sk } = keys as { pk: string; sk: string };

    logger.debug('Getting item from DynamoDB', {
      operation: 'get',
      tableName: this.tableName,
      pk,
      sk,
    });

    try {
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ pk, sk }),
      });

      const response = await this.client.send(command);

      if (!response.Item) {
        logger.debug('Item not found', { pk, sk });
        return null;
      }

      logger.debug('Item retrieved successfully', { pk, sk });
      return unmarshall(response.Item) as T;
    } catch (error) {
      logger.error('Failed to get item from DynamoDB', {
        operation: 'get',
        tableName: this.tableName,
        pk,
        sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new GetByIdError('item', `${pk}#${sk}`, error as Error);
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
    logger.debug('Saving item to DynamoDB', {
      operation: 'save',
      tableName: this.tableName,
      pk: entity.pk,
      sk: entity.sk,
      hasTtl: entity.ttl !== undefined,
    });

    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(entity, { removeUndefinedValues: true }),
      });

      await this.client.send(command);

      logger.debug('Item saved successfully', {
        pk: entity.pk,
        sk: entity.sk,
      });
    } catch (error) {
      logger.error('Failed to save item to DynamoDB', {
        operation: 'save',
        tableName: this.tableName,
        pk: entity.pk,
        sk: entity.sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new SaveError('item', `${entity.pk}#${entity.sk}`, error as Error);
    }
  }

}
