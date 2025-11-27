import { DynamoDBEntity, Entity } from '../types/Entity';
import { Repository } from './Repository';
import { DynamoDBRepository } from './DynamoDBRepository';
import { StoreType } from '../types/StoreType';
import { DynamoDBConfig } from '../types/DynamoDBConfig';

/**
 * Factory class for creating DynamoDB repository instances.
 */
export class RepositoryFactory {
  /**
   * Creates a DynamoDB repository instance.
   * 
   * @template T - The entity type that extends Entity
   * @param storeType - Must be StoreType.DYNAMODB
   * @param config - DynamoDB configuration with tableName and client
   * @returns A DynamoDB repository instance
   * @example
   * ```typescript
   * const dynamoRepo = RepositoryFactory.create<User>(
   *   StoreType.DYNAMODB,
   *   { tableName: 'users-table', client: dynamoDbClient }
   * );
   * ```
   */
  static create<T extends Entity>(
    storeType: StoreType.DYNAMODB,
    config: DynamoDBConfig,
  ): Repository<T> {
    if (storeType !== StoreType.DYNAMODB) {
      throw new Error(`Unsupported store type: ${storeType}`);
    }

    if (!config?.tableName || !config?.client) {
      throw new Error(
        'DynamoDB configuration with tableName and client is required',
      );
    }
    
    return new DynamoDBRepository<T & DynamoDBEntity>(config.tableName, config.client) as Repository<T>;
  }
}
