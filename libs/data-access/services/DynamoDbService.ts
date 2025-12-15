import { DynamoDBEntity } from '../types/Entity';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { DeleteError, GetError, SaveError } from '../errors/Errors';
import { Logger } from '@libs/utils';


/**
 * Service class for DynamoDB entity operations with business logic.
 * Provides a higher-level API with validation, transformation, and orchestration.
 * Designed specifically for DynamoDB single-table design with composite keys.
 * @template T - The entity type that extends DynamoDBEntity
 */
export class DynamoDbService<T extends DynamoDBEntity> {
  private readonly logger

  constructor(private readonly repository: DynamoDBRepository<T>, logger?: Logger) {
    this.logger = logger
  }

  /**
   * Retrieves an entity by its composite key.
   * @param pk - Partition key
   * @param sk - Sort key
   * @returns A promise that resolves to the entity if found, or null if not found
   * @throws {GetError} if pk or sk is missing
   */
  async getByKey(pk: string, sk: string): Promise<T | null> {
    this.logger?.info('Getting entity by key', {
      operation: 'getByKey',
      pk,
      sk,
    });

    if (!pk || !sk) {
      this.logger?.error('Invalid keys provided', {
        operation: 'getByKey',
        pk: pk || 'undefined',
        sk: sk || 'undefined',
      });
      throw new GetError(
        'entity',
        `${pk || 'undefined'}#${sk || 'undefined'}`,
        new Error('Both pk and sk are required'),
      );
    }

    try {
      const result = await this.repository.get({ pk, sk } as Partial<T>);
      this.logger?.info('Get entity completed', {
        operation: 'getByKey',
        pk,
        sk,
        found: !!result,
      });
      return result;
    } catch (error) {
      this.logger?.error('Get entity failed', {
        operation: 'getByKey',
        pk,
        sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Retrieves an entity by its composite key.
   * @param pk - Partition key
   * @param sk - Sort key
   * @returns A promise that resolves to the entity if found, or null if not found
   * @throws {DeleteError} if pk or sk is missing
   */
  async deleteByKey(pk: string, sk: string): Promise<void> {
    this.logger?.info('deleting entity by key', {
      operation: 'getByKey',
      pk,
      sk,
    });

    if (!pk || !sk) {
      this.logger?.error('Invalid keys provided', {
        operation: 'deleteByKey',
        pk: pk || 'undefined',
        sk: sk || 'undefined',
      });
      throw new DeleteError(
        'entity',
        `${pk || 'undefined'}#${sk || 'undefined'}`,
        new Error('Both pk and sk are required'),
      );
    }

    try {
      await this.repository.delete({ pk, sk } as Partial<T>);
      this.logger?.info('Delete entity completed', {
        operation: 'deleteByKey',
        pk,
        sk,
      });
    } catch (error) {
      this.logger?.error('Delete entity failed', {
        operation: 'deleteByKey',
        pk,
        sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Saves an entity with validation.
   * @param entity - The entity to save
   * @returns A promise that resolves when the save operation is complete
   * @throws {SaveError} if entity is invalid
   */
  async save(entity: T): Promise<void> {
    this.logger?.info('Saving entity', {
      operation: 'save',
      pk: entity.pk,
      sk: entity.sk,
    });

    try {
      this.validateEntity(entity);
      await this.repository.save(entity);
      this.logger?.info('Save entity completed', {
        operation: 'save',
        pk: entity.pk,
        sk: entity.sk,
      });
    } catch (error) {
      this.logger?.error('Save entity failed', {
        operation: 'save',
        pk: entity.pk || 'undefined',
        sk: entity.sk || 'undefined',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validates entity has required fields.
   * @param entity - The entity to validate
   * @throws {SaveError} if entity is invalid
   */
  private validateEntity(entity: T): void {
    if (!entity.pk || !entity.sk) {
      throw new SaveError(
        'entity',
        `${entity.pk || 'undefined'}#${entity.sk || 'undefined'}`,
        new Error('Entity must have both pk and sk'),
      );
    }

    if (entity.ttl !== undefined) {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (entity.ttl <= nowInSeconds) {
        throw new SaveError(
          'entity',
          `${entity.pk}#${entity.sk}`,
          new Error('TTL must be a future timestamp in seconds since epoch'),
        );
      }
    }
  }
}
