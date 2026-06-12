import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
  ListTablesCommand,
  GlobalSecondaryIndex,
} from '@aws-sdk/client-dynamodb';
import {
  CreateQueueCommand,
  ListQueuesCommand,
  QueueNameExists,
  SQSClient,
} from '@aws-sdk/client-sqs';
import { routes } from '../libs/utils/schemas/routes/routes';

const DYNAMODB_ENDPOINT =
  process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const SQS_ENDPOINT = process.env.SQS_ENDPOINT ?? 'http://localhost:9324';
const REGION = 'eu-west-2';

type TableConfig = {
  name: string;
  globalSecordaryIndexes?: GlobalSecondaryIndex[];
};

const SK_INDEX: GlobalSecondaryIndex = {
  IndexName: 'sk-index',
  KeySchema: [
    {
      AttributeName: 'sk',
      KeyType: 'HASH',
    },
    {
      AttributeName: 'pk',
      KeyType: 'RANGE',
    },
  ],
  Projection: { ProjectionType: 'ALL' },
};

const TABLES: TableConfig[] = [
  { name: 'udp-data-local' },
  { name: 'udp-identity-local', globalSecordaryIndexes: [SK_INDEX] },
];

const ddb = new DynamoDBClient({
  endpoint: DYNAMODB_ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

const sqs = new SQSClient({
  endpoint: SQS_ENDPOINT,
  region: REGION,
  credentials: { accessKeyId: 'local', secretAccessKey: 'local' },
});

async function waitFor(
  name: string,
  fn: () => Promise<unknown>,
  { timeoutMs = 30_000, intervalMs = 500 } = {},
): Promise<void> {
  const start = Date.now();
  let lastErr: unknown;

  while (Date.now() - start < timeoutMs) {
    try {
      await fn();
      console.log(`   ${name} ready`);
      return;
    } catch (error) {
      lastErr = error;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new Error(`${name} not ready. error: ${JSON.stringify(lastErr)}`);
}

async function createTable({ name, globalSecordaryIndexes }: TableConfig) {
  try {
    await ddb.send(
      new CreateTableCommand({
        TableName: name,
        BillingMode: 'PAY_PER_REQUEST',
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
        ],
        GlobalSecondaryIndexes: globalSecordaryIndexes,
      }),
    );

    console.log(`   created table ${name}`);
  } catch (err) {
    if (err instanceof ResourceInUseException) {
      console.log(`   table ${name} already exists`);
      return;
    }
    throw err;
  }
}

async function createQueue(queueName: string) {
  try {
    await sqs.send(
      new CreateQueueCommand({
        QueueName: queueName,
      }),
    );

    console.log(`   created table ${queueName}`);
  } catch (err) {
    if (err instanceof QueueNameExists) {
      console.log(`   queue ${queueName} already exists`);
      return;
    }
    throw err;
  }
}

async function main() {
  console.log('Waiting for services...');
  await waitFor('DynamoDB', () => ddb.send(new ListTablesCommand()));
  await waitFor('SQS', () => sqs.send(new ListQueuesCommand()));

  console.log('Provisioning DynamoDB tables...');
  for (const table of TABLES) {
    await createTable(table);
  }

  const queueNames = new Set<string>();
  for (const route of Object.values(routes)) {
    if ('queueName' in route && route.queueName)
      queueNames.add(route.queueName);
  }

  console.log('Provisioning SQS queues...');
  for (const queueName of queueNames) {
    await createQueue(queueName);
  }

  console.log('Done');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
