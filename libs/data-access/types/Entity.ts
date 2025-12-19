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

export interface IdentityRecordEntity {
  /**
   * Partition key for the entity always IDENTITY_RECORD#.
   */
  pk: string;
  /**
   * Sort key for the entity the SERVICE.ID/UDP.ID.
   */
  sk: string;

  /**
   * local secondary index UDP.ID/SERVICE.ID.
   */
  lsi_1?: string;
  /**
   * unique UUIDv4 for UDP.ID.
   */
  udpId: string;

  /**
   * Service Id
   * The unique user id from the service eg DWP, Flex
   */
  serviceId: string;

  /**
   * Service Name
   * The unique name for the service eg DWP, Flex
   */
  serviceName: string;

  /**
   * Optional time-to-live (TTL) attribute for automatic expiration.
   * Should be a Unix timestamp (seconds since epoch) indicating when the item should be deleted.
   */
  ttl?: number;

  /**
   * Access Token for the service
   */
  accessToken?: string;

  /**
   * Id Token for the service
   */
  idToken?: string;

  /**
   * Refresh Token for the service
   */
  refreshToken?: string;
}

export interface DataInput {
  ttl?: number,
  [key:string]: unknown
}

export interface DynamoDBDataEntity {
  pk: string;
  sk: string;
  data?: Record<string, unknown>;
  ttl?: number;
}

export interface IdentityInput {
  serviceId: string;
  serviceName: string;
  appId: string;
  udpId?: string;
  accessToken?: string;
  refreshToken?: string;
  idToken?: string;
  ttl?: number;
}

export type CreateIdentityRequest = Omit<IdentityInput, 'serviceId'>;

export interface UserDataInput {
  resourcePath: string;
  ttl?: number;
  [key: string]: unknown;
}
