import { GetByIdError, SaveError } from '../errors/Errors';
import { CompositeKeyEntity } from '../types/Entity';
import { logger } from '../utils/Logger';
import { Repository } from './Repository';


/**
 * In-memory repository implementation for composite key entities.
 * Data is not persisted and will be lost when the process ends.
 * Useful for testing and development purposes.
 * @template T - The entity type that extends CompositeKeyEntity
 */
export class MemoryRepository<T extends CompositeKeyEntity>
  implements Repository<T>
{
  private items: Map<string, T> = new Map();

  /**
   * Retrieves an entity by its key(s) from the in-memory store.
   * Returns a deep clone to prevent external mutations.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   * @throws {GetByIdError} When the retrieval operation fails or required keys are missing
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

    logger.debug('Getting item from memory', {
      operation: 'get',
      pk,
      sk,
    });

    try {
      const key = `${pk}#${sk}`;
      const item = this.items.get(key);
      
      if (item) {
        logger.debug('Item retrieved from memory', { pk, sk });
      } else {
        logger.debug('Item not found in memory', { pk, sk });
      }
      
      return item ? structuredClone(item) : null;
    } catch (error) {
      logger.error('Failed to get item from memory', {
        operation: 'get',
        pk,
        sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new GetByIdError('item', `${pk}#${sk}`, error as Error);
    }
  }

  /**
   * Saves an entity to the in-memory store.
   * Stores a deep clone to prevent external mutations.
   * If an entity with the same key(s) exists, it will be overwritten.
   * @param entity - The entity to save
   * @returns A promise that resolves when the save operation is complete
   * @throws {SaveError} When the save operation fails
   */
  async save(entity: T): Promise<void> {
    logger.debug('Saving item to memory', {
      operation: 'save',
      pk: entity.pk,
      sk: entity.sk,
      hasTtl: entity.ttl !== undefined,
    });

    try {
      const key = `${entity.pk}#${entity.sk}`;
      // Deep clone to prevent external mutations
      this.items.set(key, structuredClone(entity));

      logger.debug('Item saved to memory', {
        pk: entity.pk,
        sk: entity.sk,
      });
    } catch (error) {
      logger.error('Failed to save item to memory', {
        operation: 'save',
        pk: entity.pk,
        sk: entity.sk,
        error: error instanceof Error ? error.message : String(error),
      });
      throw new SaveError('item', `${entity.pk}#${entity.sk}`, error as Error);
    }
  }

  /**
   * Clears all entities from the in-memory store.
   * Useful for testing and resetting state.
   */
  clear(): void {
    this.items.clear();
  }
}
