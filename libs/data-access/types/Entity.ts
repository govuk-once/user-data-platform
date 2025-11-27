/**
 * Base entity interface that all entities must extend.
 * Provides the foundation for different entity types.
 */
export interface Entity {
  // Marker interface for type safety
}

/**
 * Entity interface for items with composite keys (partition key and sort key).
 * Commonly used for single-table design patterns in various storage systems.
 * Extends the base Entity interface.
 */
export interface CompositeKeyEntity extends Entity {
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
   */
  data?: Record<string, any>;
  /**
   * Optional time-to-live (TTL) attribute for automatic expiration.
   * Should be a Unix timestamp (seconds since epoch) indicating when the item should be deleted.
   */
  ttl?: number;
}
