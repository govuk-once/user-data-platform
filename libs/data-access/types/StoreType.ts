/**
 * Enumeration of available store types for repository creation.
 */
export enum StoreType {
  /**
   * In-memory store for testing and development.
   */
  MEMORY = 'MEMORY',
  /**
   * AWS DynamoDB store with composite keys (pk/sk) for single-table design.
   */
  DYNAMODB = 'DYNAMODB',
}
