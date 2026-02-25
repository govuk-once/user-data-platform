import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
  ScanCommand,
} from '@aws-sdk/lib-dynamodb';

// Configuration from environment variables
const config = {
  awsRegion: process.env.AWS_REGION || 'eu-west-2',
  identityTableName: process.env.IDENTITY_TABLE_NAME,
  dataTableName: process.env.DYNAMODB_TABLE_NAME,
  testPrefix: process.env.TEST_PREFIX || 'perf',
  batchSize: 25, // DynamoDB BatchWrite limit
  maxRetries: 5,
  baseBackoffMs: 100,
};

// Validate required config
if (!config.identityTableName || !config.dataTableName) {
  throw new Error(
    'IDENTITY_TABLE_NAME and DYNAMODB_TABLE_NAME environment variables are required',
  );
}

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.awsRegion }),
  { marshallOptions: { removeUndefinedValues: true } },
);

interface CleanupStats {
  identitiesScanned: number;
  identitiesDeleted: number;
  dataScanned: number;
  dataDeleted: number;
  retries: number;
  startTime: number;
  endTime?: number;
}

const stats: CleanupStats = {
  identitiesScanned: 0,
  identitiesDeleted: 0,
  dataScanned: 0,
  dataDeleted: 0,
  retries: 0,
  startTime: Date.now(),
};

/**
 * Sleep for exponential backoff
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Batch delete items with retry and exponential backoff
 */
async function batchDeleteWithRetry(
  tableName: string,
  items: { pk: string; sk: string }[],
  itemType: 'identity' | 'data',
): Promise<void> {
  if (items.length === 0) {
    return;
  }

  const batches: { pk: string; sk: string }[][] = [];

  // Split into batches of 25 (DynamoDB limit)
  for (let i = 0; i < items.length; i += config.batchSize) {
    batches.push(items.slice(i, i + config.batchSize));
  }

  console.log(
    `Deleting ${items.length} ${itemType} records in ${batches.length} batches...`,
  );

  for (let i = 0; i < batches.length; i++) {
    let unprocessedItems = batches[i];
    let retryCount = 0;

    while (unprocessedItems.length > 0 && retryCount < config.maxRetries) {
      try {
        const requestItems = {
          [tableName]: unprocessedItems.map((item) => ({
            DeleteRequest: { Key: { pk: item.pk, sk: item.sk } },
          })),
        };

        const response = await client.send(
          new BatchWriteCommand({ RequestItems: requestItems }),
        );

        // Check for unprocessed items
        const unprocessed = response.UnprocessedItems?.[tableName];

        if (unprocessed && unprocessed.length > 0) {
          unprocessedItems = unprocessed.map((req) => ({
            pk: req.DeleteRequest!.Key!.pk as string,
            sk: req.DeleteRequest!.Key!.sk as string,
          }));
          retryCount++;
          stats.retries++;

          // Exponential backoff
          const backoffMs = config.baseBackoffMs * Math.pow(2, retryCount);
          console.log(
            `Batch ${i + 1}/${batches.length}: ${unprocessedItems.length} unprocessed items, ` +
              `retrying in ${backoffMs}ms (attempt ${retryCount}/${config.maxRetries})`,
          );
          await sleep(backoffMs);
        } else {
          // Successfully deleted all items
          if (itemType === 'identity') {
            stats.identitiesDeleted += batches[i].length;
          } else {
            stats.dataDeleted += batches[i].length;
          }
          unprocessedItems = [];
        }
      } catch (error) {
        retryCount++;
        stats.retries++;

        if (retryCount >= config.maxRetries) {
          throw new Error(
            `Failed to delete batch ${i + 1} after ${config.maxRetries} retries: ${error}`,
          );
        }

        const backoffMs = config.baseBackoffMs * Math.pow(2, retryCount);
        console.error(
          `Batch ${i + 1}/${batches.length}: Error occurred, retrying in ${backoffMs}ms: ${error}`,
        );
        await sleep(backoffMs);
      }
    }

    if (unprocessedItems.length > 0) {
      throw new Error(
        `Failed to delete ${unprocessedItems.length} items after ${config.maxRetries} retries`,
      );
    }

    // Progress update every 10 batches
    if ((i + 1) % 10 === 0) {
      const progress = (((i + 1) / batches.length) * 100).toFixed(1);
      console.log(
        `Progress: ${progress}% (${i + 1}/${batches.length} batches)`,
      );
    }

    // Small delay between batches to avoid throttling
    if (i < batches.length - 1) {
      await sleep(50);
    }
  }
}

/**
 * Scan table and find all items matching test prefix
 */
async function scanTableForPrefix(
  tableName: string,
  prefixPattern: string,
): Promise<{ pk: string; sk: string }[]> {
  const items: { pk: string; sk: string }[] = [];
  let lastEvaluatedKey: Record<string, unknown> | undefined;
  let scanCount = 0;

  console.log(
    `Scanning ${tableName} for items with prefix '${prefixPattern}'...`,
  );

  do {
    const command = new ScanCommand({
      TableName: tableName,
      ExclusiveStartKey: lastEvaluatedKey,
      FilterExpression:
        'begins_with(pk, :pkPrefix) OR begins_with(sk, :skPrefix) OR begins_with(serviceId, :prefix)',
      ExpressionAttributeValues: {
        ':pkPrefix': `app#${prefixPattern}`,
        ':skPrefix': `/test-data/${prefixPattern}`,
        ':prefix': prefixPattern,
      },
    });

    const response = await client.send(command);
    scanCount++;

    if (response.Items) {
      for (const item of response.Items) {
        items.push({
          pk: item.pk as string,
          sk: item.sk as string,
        });
      }
    }

    lastEvaluatedKey = response.LastEvaluatedKey;

    // Progress update
    if (scanCount % 10 === 0) {
      console.log(
        `Scanned ${scanCount} pages, found ${items.length} matching items so far...`,
      );
    }
  } while (lastEvaluatedKey);

  console.log(
    `Scan complete. Found ${items.length} items matching prefix '${prefixPattern}'`,
  );
  return items;
}

/**
 * Main cleanup function
 */
async function cleanupData(): Promise<void> {
  console.log('=== UDP Data Cleanup ===');
  console.log(`Region: ${config.awsRegion}`);
  console.log(`Identity Table: ${config.identityTableName}`);
  console.log(`Data Table: ${config.dataTableName}`);
  console.log(`Test Prefix: ${config.testPrefix}`);
  console.log('');

  try {
    // Scan and delete from identity table
    console.log('Scanning identity table...');
    const identityItems = await scanTableForPrefix(
      config.identityTableName!,
      config.testPrefix,
    );
    stats.identitiesScanned = identityItems.length;
    console.log('');

    if (identityItems.length > 0) {
      await batchDeleteWithRetry(
        config.identityTableName!,
        identityItems,
        'identity',
      );
      console.log(
        `✅ Successfully deleted ${stats.identitiesDeleted} identity records`,
      );
    } else {
      console.log('No identity records found to delete');
    }
    console.log('');

    // Scan and delete from data table
    console.log('Scanning data table...');
    const dataItems = await scanTableForPrefix(
      config.dataTableName!,
      config.testPrefix,
    );
    stats.dataScanned = dataItems.length;
    console.log('');

    if (dataItems.length > 0) {
      await batchDeleteWithRetry(config.dataTableName!, dataItems, 'data');
      console.log(`✓ Successfully deleted ${stats.dataDeleted} data records`);
    } else {
      console.log('No data records found to delete');
    }
    console.log('');

    stats.endTime = Date.now();
    const durationSeconds = ((stats.endTime - stats.startTime) / 1000).toFixed(
      2,
    );

    console.log('=== Cleanup Complete ===');
    console.log(`Total Duration: ${durationSeconds}s`);
    console.log(`Identities Scanned: ${stats.identitiesScanned}`);
    console.log(`Identities Deleted: ${stats.identitiesDeleted}`);
    console.log(`Data Records Scanned: ${stats.dataScanned}`);
    console.log(`Data Records Deleted: ${stats.dataDeleted}`);
    console.log(`Total Retries: ${stats.retries}`);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

// Run the cleanup
cleanupData();
