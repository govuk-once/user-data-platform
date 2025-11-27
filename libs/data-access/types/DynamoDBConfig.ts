import { DynamoDBClient } from "@aws-sdk/client-dynamodb";

/**
 * Configuration options for creating a DynamoDB repository.
 */
export interface DynamoDBConfig {
  /**
   * The name of the DynamoDB table.
   */
  tableName: string;
  /**
   * DynamoDB client instance.
   * Should be created outside the repository for Lambda performance (connection pooling).
   */
  client: DynamoDBClient;
}