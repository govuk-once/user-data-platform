import { CompositeKeyEntity, Entity } from '../types/Entity';
import { Repository } from './Repository';
import { DynamoDBRepository } from './DynamoDBRepository';
import { StoreType } from '../types/StoreType';
import { DynamoDBConfig } from '../types/DynamoDBConfig';
import { MemoryRepository } from './memoryRepository';

/**
 * Factory class for creating repository instances based on store type.
 */
export class RepositoryFactory {
  /**
   * Creates a repository instance for the specified store type.
   * The config parameter type is determined by the store type:
   * - StoreType.MEMORY: no config needed
   * - StoreType.DYNAMODB: requires DynamoDBConfig
   * 
   * Note: Current implementations (DynamoDB and Memory) require composite key entities.
   * The generic constraint allows for future repository implementations with different entity types.
   * 
   * @template T - The entity type that extends Entity
   * @param storeType - The type of store to create
   * @param config - Configuration for the store (type depends on storeType)
   * @returns A repository instance
   * @example
   * ```typescript
   * // Memory repository - no config needed
   * const memoryRepo = RepositoryFactory.create<User>(StoreType.MEMORY);
   * 
   * // DynamoDB repository - config required
   * const dynamoRepo = RepositoryFactory.create<User>(
   *   StoreType.DYNAMODB,
   *   { tableName: 'users-table', client: dynamoDbClient }
   * );
   * ```
   */
  static create<T extends Entity>(
    storeType: StoreType.MEMORY,
  ): Repository<T>;
  static create<T extends Entity>(
    storeType: StoreType.DYNAMODB,
    config: DynamoDBConfig,
  ): Repository<T>;
  static create<T extends Entity>(
    storeType: StoreType,
    config?: DynamoDBConfig,
  ): Repository<T> {
    switch (storeType) {
      case StoreType.MEMORY:
        return new MemoryRepository<T & CompositeKeyEntity>() as Repository<T>;

      case StoreType.DYNAMODB:
        if (!config?.tableName || !config?.client) {
          throw new Error(
            'DynamoDB configuration with tableName and client is required for DYNAMODB store type',
          );
        }
        return new DynamoDBRepository<T & CompositeKeyEntity>(config.tableName, config.client) as Repository<T>;

      default:
        throw new Error(`Unsupported store type: ${storeType}`);
    }
  }
}
