import { Entity } from '../types/Entity';

/**
 * Base repository interface for entity storage operations.
 * @template T - The entity type that extends Entity
 */
export interface Repository<T extends Entity> {
  /**
   * Retrieves an entity by its key(s).
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   */
  get(keys: Partial<T>): Promise<T | null>;

  /**
   * Retrives an entry where the sk begins with.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   */
  skBeginswith(keys: Partial<T>): Promise<T | null>;

  /**
   * Saves an entity to the repository.
   * If an entity with the same key(s) exists, it will be overwritten.
   * @param entity - The entity to save
   * @returns A promise that resolves when the save operation is complete
   */
  save(entity: T): Promise<void>;

  /**
   * Saves an entity to the repository.
   * If an entity with the same key(s) exists, it will be overwritten.
   * @param keys - The entity to save
   * @returns A promise that resolves when the delete operation is complete
   */
  delete(keys: Partial<T>): Promise<boolean | null>;
}
