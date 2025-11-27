import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

/**
 * Configuration options for creating a DynamoDB repository.
 */
export interface DynamoDBConfig {
  /**
   * The name of the DynamoDB table.
   */
  tableName: string;
  /**
   * DynamoDB Document Client instance.
   * Should be created outside the repository for Lambda performance (connection pooling).
   */
  client: DynamoDBDocumentClient;
}