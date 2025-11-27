import { DynamoDBEntity } from '../types/Entity';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { GetError, SaveError } from '../errors/Errors';
import { logger } from '../utils/Logger';

/**
 * Service class for DynamoDB entity operations with business logic.
 * Provides a higher-level API with validation, transformation, and orchestration.
 * Designed specifically for DynamoDB single-table design with composite keys.
 * @template T - The entity type that extends DynamoDBEntity
 */
export class DynamoDbService<T extends DynamoDBEntity> {
  constructor(private readonly repository: DynamoDBRepository<T>) {}

  /**
   * Retrieves an entity by its composite key.
   * @param pk - Partition key
   * @param sk - Sort key
   * @returns A promise that resolves to the entity if found, or null if not found
   * @throws {GetError} if pk or sk is missing
   */
  async getByKey(pk: string, sk: string): Promise<T | null> {
    logger.info('Getting entity by key', {
      operation: 'getByKey',
      pk,
      sk,
    });

    if (!pk || !sk) {
      logger.error('Invalid keys provided', {
        operation: 'getByKey',
        pk: pk || 'undefined',
        sk: sk || 'undefined',
      });
      throw new GetError(
        'entity',
        `${pk || 'undefined'}#${sk || 'undefined'}`,
        new Error('Both pk and sk are required')
      );
    }

    try {
      const result = await this.repository.get({ pk, sk } as Partial<T>);
      logger.info('Get entity completed', {
        operation: 'getByKey',
        pk,
        sk,
        found: !!result,
      });
      return result;
    } catch (error) {
      logger.error('Get entity failed', {
        operation: 'getByKey',
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
    logger.info('Saving entity', {
      operation: 'save',
      pk: entity.pk,
      sk: entity.sk,
    });

    try {
      this.validateEntity(entity);
      await this.repository.save(entity);
      logger.info('Save entity completed', {
        operation: 'save',
        pk: entity.pk,
        sk: entity.sk,
      });
    } catch (error) {
      logger.error('Save entity failed', {
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
        new Error('Entity must have both pk and sk')
      );
    }

    if (entity.ttl !== undefined && entity.ttl < 0) {
      throw new SaveError(
        'entity',
        `${entity.pk}#${entity.sk}`,
        new Error('TTL must be a positive number')
      );
    }
  }
}
