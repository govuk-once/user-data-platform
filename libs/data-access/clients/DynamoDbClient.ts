import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { DynamoDbService } from '../services/DynamoDbService';
import { DynamoDBEntity } from '../types/Entity';

/**
 * DynamoDB client that provides a configured service instance.
 * Handles the setup and initialization of AWS SDK clients and repository.
 */
export class DynamoDbClient<T extends DynamoDBEntity> {
  private readonly service: DynamoDbService<T>;

  constructor(tableName: string | undefined) {
    if (!tableName) {
      throw new Error('TABLE_NAME environment variable is required');
    }

    // Initialize AWS SDK clients
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    // Initialize repository and service
    const repository = new DynamoDBRepository<T>(tableName, docClient);
    this.service = new DynamoDbService(repository);
  }

  /**
   * Get the configured DynamoDB service instance.
   */
  getService(): DynamoDbService<T> {
    return this.service;
  }
}
