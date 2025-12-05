import { EncryptionService } from '../services/EncryptionService';

/**
 * Base entity interface that all entities must extend.
 * Provides the foundation for different entity types.
 */
export interface Entity {
  // Marker interface for type safety
}

/**
 * DynamoDB-compatible value types.
 * Reflects the actual data types supported by DynamoDB Document Client:
 * - Primitives: string, number, boolean, null
 * - Binary: Uint8Array for binary data
 * - Collections: arrays and nested objects
 * - Sets: Set<string>, Set<number>, Set<Uint8Array>
 *
 * Note: undefined values are removed by Document Client, functions and symbols are not supported.
 */
export type DynamoDBValue =
  | string
  | number
  | boolean
  | null
  | Uint8Array
  | Set<string>
  | Set<number>
  | Set<Uint8Array>
  | DynamoDBValue[]
  | { [key: string]: DynamoDBValue };

/**
 * DynamoDB attribute map type.
 * Represents the structure of a DynamoDB item's attributes.
 */
export type DynamoDBAttributeMap = {
  [key: string]: DynamoDBValue;
};

/**
 * DynamoDB entity interface with composite keys (partition key and sort key).
 * Designed for DynamoDB single-table design patterns.
 * Extends the base Entity interface.
 *
 * @template TData - The type of the data payload. Defaults to DynamoDBAttributeMap.
 *                   Can be overridden with a more specific type that extends DynamoDBAttributeMap.
 *
 * @example
 * ```typescript
 * // Using default DynamoDB-compatible type
 * const entity: DynamoDBEntity = {
 *   pk: 'item-123',
 *   sk: 'metadata',
 *   data: { status: 'active', tags: ['verified', 'premium'] }
 * };
 *
 * // Using custom strongly-typed data
 * interface ItemData extends DynamoDBAttributeMap {
 *   status: 'active' | 'inactive';
 *   count: number;
 *   tags: string[];
 * }
 *
 * interface Item extends DynamoDBEntity<ItemData> {
 *   pk: string;
 *   sk: string;
 * }
 * ```
 */
export interface DynamoDBEntity<
  TData extends DynamoDBAttributeMap = DynamoDBAttributeMap,
> extends Entity {
  /**
   * Partition key for the entity.
   */
  pk: string;
  /**
   * Sort key for the entity.
   */
  sk: string;
  /**
   * The actual data payload for the entity.
   * Must conform to DynamoDB-compatible types.
   */
  data?: TData;
  /**
   * Optional time-to-live (TTL) attribute for automatic expiration.
   * Should be a Unix timestamp (seconds since epoch) indicating when the item should be deleted.
   */
  ttl?: number;
}

export interface EncryptionConfig {
  service: EncryptionService;
  dataFields: string[];
}
