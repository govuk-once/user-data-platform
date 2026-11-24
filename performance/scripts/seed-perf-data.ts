import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { v5 as uuidv5 } from 'uuid';

const SEED_NAMESPACE = '7e4fde74-7ca7-4d33-b6aa-77c83b8d0a25';

const config = {
  awsRegion: process.env.AWS_REGION || 'eu-west-2',
  identityTableName: process.env.IDENTITY_TABLE_NAME,
  dataTableName: process.env.DYNAMODB_TABLE_NAME,
  testPrefix: process.env.TEST_PREFIX || 'per-stress-reads',
  vuCount: parseInt(process.env.SEED_VU_COUNT || '500', 10),
  resourcePath: process.env.RESOURCE_PATH || 'topics',
  linkedServiceName: process.env.LINKED_SERVICE_NAME || 'perf-svc',
  batchSize: 25,
  maxRetries: 5,
  baseBackoffMs: 100,
};

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function batchWriteWithRetry(
  tableName: string,
  items: Record<string, unknown>[],
  itemType: 'identity' | 'data',
): Promise<void> {
  const batches: Record<string, unknown>[][] = [];

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

        const unprocessed = response.UnprocessedItems?.[tableName];

        if (unprocessed && unprocessed.length > 0) {
          unprocessedItems = unprocessed.map((req) => req.PutRequest!.Item!);
          retryCount++;
          stats.retries++;

          const backoffMs = config.baseBackoffMs * Math.pow(2, retryCount);
          console.log(
            `Batch ${i + 1}/${batches.length}: ${unprocessedItems.length} unprocessed items, ` +
              `retrying in ${backoffMs}ms (attempt ${retryCount}/${config.maxRetries})`,
          );
          await sleep(backoffMs);
        } else {
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

    if ((i + 1) % 10 === 0) {
      const progress = (((i + 1) / batches.length) * 100).toFixed(1);
      console.log(
        `Progress: ${progress}% (${i + 1}/${batches.length} batches)`,
      );
    }

    if (i < batches.length - 1) {
      await sleep(50);
    }
  }
}

function appIdForVu(vu: number): string {
  return `${config.testPrefix}-vu-${vu}`;
}

// Deterministic udpId per VU so reruns overwrite the same items rather than
// growing the dataset.
function udpIdForVu(vu: number): string {
  return uuidv5(appIdForVu(vu), SEED_NAMESPACE);
}

function generateIdentityRecords(): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];

  for (let i = 0; i < config.vuCount; i++) {
    const appId = appIdForVu(i);
    const udpId = udpIdForVu(i);

    records.push({
      pk: `app#${appId}`,
      sk: udpId,
      udpId,
      serviceId: appId,
      serviceName: 'app',
    });

    const linkedServiceId = `identity-${appId}`;
    records.push({
      pk: `${config.linkedServiceName}#${linkedServiceId}`,
      sk: udpId,
      udpId,
      serviceId: linkedServiceId,
      serviceName: config.linkedServiceName,
    });
  }

  return records;
}

function generateDataRecords(): Record<string, unknown>[] {
  const records: Record<string, unknown>[] = [];

  for (let i = 0; i < config.vuCount; i++) {
    records.push({
      pk: udpIdForVu(i),
      sk: config.resourcePath,
      data: { seeded: true, vu: i },
    });
  }

  return records;
}

async function seedData(): Promise<void> {
  console.log('=== UDP Perf Data Seeding ===');
  console.log(`Region: ${config.awsRegion}`);
  console.log(`Identity Table: ${config.identityTableName}`);
  console.log(`Data Table: ${config.dataTableName}`);
  console.log(`Test Prefix: ${config.testPrefix}`);
  console.log(`Linked Service: ${config.linkedServiceName}`);
  console.log(`Resource Path: ${config.resourcePath}`);
  console.log(`VU Count: ${config.vuCount}`);
  console.log('');

  try {
    const identityRecords = generateIdentityRecords();
    console.log(
      `Generated ${identityRecords.length} identity records (${config.vuCount} app + ${config.vuCount} ${config.linkedServiceName})`,
    );

    await batchWriteWithRetry(
      config.identityTableName!,
      identityRecords,
      'identity',
    );
    console.log(
      `✓ Successfully wrote ${stats.identitiesWritten} identity records`,
    );
    console.log('');

    const dataRecords = generateDataRecords();
    console.log(
      `Generated ${dataRecords.length} data records on path '${config.resourcePath}'`,
    );

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

seedData();
