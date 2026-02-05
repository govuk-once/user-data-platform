import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { config } from './config';

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.awsRegion }),
  { marshallOptions: { removeUndefinedValues: true } },
);

const createdUserPks: string[] = [];

export function registerCreateUser(appId: string): void {
  const pk = `app#${appId}`;
  if (!createdUserPks.includes(pk)) {
    createdUserPks.push(pk);
  }
}

export async function cleanupCreatedUsers(): Promise<void> {
  for (const pk of createdUserPks) {
    try {
      const result = await client.send(
        new QueryCommand({
          TableName: config.identityTableName,
          KeyConditionExpression: `pk - :pk`,
          ExpressionAttributeValues: { ':pk': pk },
        }),
      );

      for (const item of result.Items ?? []) {
        await client.send(
          new DeleteCommand({
            TableName: config.identityTableName,
            Key: { pk: item.pk, sk: item.sk },
          }),
        );
      }
    } catch (error) {
      console.warn(`failed to cleanup user ${pk}`, error);
    }
  }

  createdUserPks.length = 0;
}
