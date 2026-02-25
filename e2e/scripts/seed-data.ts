import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { v4 as uuidv4 } from 'uuid';

// Configuration from environment variables
const config = {
  awsRegion: process.env.AWS_REGION || 'eu-west-2',
  identityTableName: process.env.IDENTITY_TABLE_NAME,
  dataTableName: process.env.DYNAMODB_TABLE_NAME,
  identityCount: parseInt(process.env.SEED_IDENTITY_COUNT || '10000', 10),
  dataCount: parseInt(process.env.SEED_DATA_COUNT || '50000', 10),
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

interface SeedStats {
  identitiesWritten: number;
  dataRecordsWritten: number;
  retries: number;
  startTime: number;
  endTime?: number;
}

const stats: SeedStats = {
  identitiesWritten: 0,
  dataRecordsWritten: 0,
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
 * Batch write items with retry and exponential backoff for unprocessed items
 */
async function batchWriteWithRetry(
  tableName: string,
  items: Record<string, unknown>[],
  itemType: 'identity' | 'data',
): Promise<void> {
  const batches: Record<string, unknown>[][] = [];

  // Split into batches of 25 (DynamoDB limit)
  for (let i = 0; i < items.length; i += config.batchSize) {
    batches.push(items.slice(i, i + config.batchSize));
  }

  console.log(
    `Writing ${items.length} ${itemType} records in ${batches.length} batches...`,
  );

  for (let i = 0; i < batches.length; i++) {
    let unprocessedItems = batches[i];
    let retryCount = 0;

    while (unprocessedItems.length > 0 && retryCount < config.maxRetries) {
      try {
        const requestItems = {
          [tableName]: unprocessedItems.map((item) => ({
            PutRequest: { Item: item },
          })),
        };

        const response = await client.send(
          new BatchWriteCommand({ RequestItems: requestItems }),
        );

        // Check for unprocessed items
        const unprocessed = response.UnprocessedItems?.[tableName];

        if (unprocessed && unprocessed.length > 0) {
          unprocessedItems = unprocessed.map((req) => req.PutRequest!.Item!);
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
          // Successfully wrote all items
          if (itemType === 'identity') {
            stats.identitiesWritten += batches[i].length;
          } else {
            stats.dataRecordsWritten += batches[i].length;
          }
          unprocessedItems = [];
        }
      } catch (error) {
        retryCount++;
        stats.retries++;

        if (retryCount >= config.maxRetries) {
          throw new Error(
            `Failed to write batch ${i + 1} after ${config.maxRetries} retries: ${error}`,
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
        `Failed to write ${unprocessedItems.length} items after ${config.maxRetries} retries`,
      );
    }

    // Progress update every 10 batches
    if ((i + 1) % 10 === 0) {
      const progress = (((i + 1) / batches.length) * 100).toFixed(1);
      console.log(
        `Progress: ${progress}% (${i + 1}/${batches.length} batches)`,
      );
    }

    // Gradual ramp: small delay between batches to avoid throttling
    if (i < batches.length - 1) {
      await sleep(50);
    }
  }
}

/**
 * Generate identity records with test prefix
 */
function generateIdentityRecords(count: number): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];

  for (let i = 0; i < count; i++) {
    const udpId = uuidv4();
    const serviceId = `${config.testPrefix}-user-${i}`;

    records.push({
      pk: `app#${serviceId}`,
      sk: udpId,
      udpId: udpId,
      serviceId: serviceId,
      serviceName: 'app',
    });
  }

  return records;
}

/**
 * Generate data records for identities with test prefix
 */
function generateDataRecords(
  identityRecords: Record<string, unknown>[],
  totalDataCount: number,
): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];
  const dataPerIdentity = Math.ceil(totalDataCount / identityRecords.length);

  for (const identity of identityRecords) {
    const udpId = identity.udpId as string;

    for (
      let i = 0;
      i < dataPerIdentity && records.length < totalDataCount;
      i++
    ) {
      records.push({
        pk: udpId,
        sk: `/test-data/${config.testPrefix}-resource-${i}`,
        data: {
          testField: `${config.testPrefix}-test-value-${i}`,
          timestamp: Date.now(),
          recordNumber: records.length,
        },
      });
    }
  }

  return records;
}

/**
 * Main seeding function
 */
async function seedData(): Promise<void> {
  console.log('=== UDP Data Seeding ===');
  console.log(`Region: ${config.awsRegion}`);
  console.log(`Identity Table: ${config.identityTableName}`);
  console.log(`Data Table: ${config.dataTableName}`);
  console.log(`Test Prefix: ${config.testPrefix}`);
  console.log(`Target Identities: ${config.identityCount}`);
  console.log(`Target Data Records: ${config.dataCount}`);
  console.log('');

  try {
    // Generate identity records
    console.log('Generating identity records...');
    const identityRecords = generateIdentityRecords(config.identityCount);
    console.log(`Generated ${identityRecords.length} identity records`);
    console.log('');

    // Write identity records
    await batchWriteWithRetry(
      config.identityTableName!,
      identityRecords,
      'identity',
    );
    console.log(
      `✓ Successfully wrote ${stats.identitiesWritten} identity records`,
    );
    console.log('');

    // Generate data records
    console.log('Generating data records...');
    const dataRecords = generateDataRecords(identityRecords, config.dataCount);
    console.log(`Generated ${dataRecords.length} data records`);
    console.log('');

    // Write data records
    await batchWriteWithRetry(config.dataTableName!, dataRecords, 'data');
    console.log(
      `✓ Successfully wrote ${stats.dataRecordsWritten} data records`,
    );
    console.log('');

    stats.endTime = Date.now();
    const durationSeconds = ((stats.endTime - stats.startTime) / 1000).toFixed(
      2,
    );

    console.log('=== Seeding Complete ===');
    console.log(`Total Duration: ${durationSeconds}s`);
    console.log(`Identities Written: ${stats.identitiesWritten}`);
    console.log(`Data Records Written: ${stats.dataRecordsWritten}`);
    console.log(`Total Retries: ${stats.retries}`);
  } catch (error) {
    console.error('Seeding failed:', error);
    process.exit(1);
  }
}

// Run the seeding
seedData();
