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
   * Retrives an entry where the pk is {pk}
   * @param pk - the Pk we want to fetch the record by
   * @returns A promise that resolves to the entity if found, or null if not found
   */
  getByPk(pk: string): Promise<T | null>;

  /**

  /**
   * Retrives an entry where the sk begins with.
   * @param keys - Partial entity containing the key properties needed to identify the entity
   * @returns A promise that resolves to the entity if found, or null if not found
   */
  skBeginswith(keys: Partial<T>): Promise<T | null>;

  /**
   * Counts all items with a given partition key
   * @param pk - The partition key
   * @returns A promise that resolves to the total count
   */
  countByPk(pk: string): Promise<number>;

  /**
   * Queries a single page of items by partition key returning only the pk and sk
   * @param pk - The partition key
   * @param limit - The page limit
   * @param exclusiveStartKey - Optional key ti start item from for pagination
   * @returns A promise that resolves with items and optional lastEvaluatedKey fro pagination
   */
  queryPageByPk(
    pk: string,
    limit: number,
    lastEvaluatedKey?: Record<string, unknown>,
  ): Promise<{
    items: Array<{ pk: string; sk: string }>;
    lastEvaluatedKey?: Record<string, unknown>;
  }>;

  /**
   * Queries all items by partition key returning full entities
   * @param pk - The partition key
   * @returns A promise that resolves with all items for the given pk
   */
  queryAllByPk(pk: string): Promise<T[]>;

  /**
   * Queries a single page of items by partition key returning only the pk and sk
   * @param sk - The Sort key value to query by
   * @returns A promise that resolves with items and optional lastEvaluatedKey fro pagination
   */
  queryBySk(sk: string): Promise<T[]>;

  /**
   * Queries a single page of items by partition key returning only the pk and sk
   * @param indexName - The name of the gsi
   * @param pkValue - The Pk to query
   * @param skPrefix - The prefix of the sk to query
   * @returns A promise that resolves with items and optional lastEvaluatedKey fro pagination
   */
  queryByGsi(indexName: string, pkValue: string, skPrefix?: string): Promise<T>;

  /**
   * Saves an entity to the repository.
   * If an entity with the same key(s) exists, it will be overwritten.
   * @param entity - The entity to save
   * @returns A promise that resolves when the save operation is complete
   */
  save(entity: T): Promise<T>;

  /**
   * Saves an entity to the repository.
   * If an entity with the same key(s) exists, it will be overwritten.
   * @param keys - Partial entity containing key properties to identitfy the entity
   * @param data - The entity to save
   * @returns A promise that resolves with the updated entity or null is entity doesnt exist
   */
  update(keys: Partial<T>, data: Record<string, unknown>): Promise<T | null>;

  /**
   * Saves an entity to the repository.
   * If an entity with the same key(s) exists, it will be overwritten.
   * @param keys - The entity to save
   * @returns A promise that resolves when the delete operation is complete
   */
  delete(keys: Partial<T>): Promise<boolean | null>;
}
