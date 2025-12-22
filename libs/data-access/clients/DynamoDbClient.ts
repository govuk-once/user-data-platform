import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { DynamoDbService } from '../services/DynamoDbService';
import { DynamoDBEntity } from '../types/Entity';
import { EncryptionService } from '../services/EncryptionService';
import { Tracer } from '@aws-lambda-powertools/tracer';

/**
 * DynamoDB client that provides a configured service instance.
 * Handles the setup and initialization of AWS SDK clients and repository.
 */
export class DynamoDbClient<T extends DynamoDBEntity> {
  private readonly service: DynamoDbService<T>;
  public readonly client: DynamoDBClient;
  constructor(tableName: string | undefined, kmsKeyId?: string, tracer?: Tracer) {
    if (!tableName) {
      throw new Error('TABLE_NAME environment variable is required');
    }

    // Initialize AWS SDK clients
    const client = tracer ? tracer.captureAWSv3Client(new DynamoDBClient({})) : new DynamoDBClient();
    this.client = client;
    const docClient = DynamoDBDocumentClient.from(client);

    let encryption = undefined;
    if(kmsKeyId) {
      encryption = { service: new EncryptionService({kmsKeyId}, tracer), dataFields: ['data']}
    }

    // Initialize repository and service
    const repository = new DynamoDBRepository<T>(tableName, docClient, encryption);
    this.service = new DynamoDbService(repository);
  }

  /**
   * Get the configured DynamoDB service instance.
   */
  getService(): DynamoDbService<T> {
    return this.service;
  }
}
