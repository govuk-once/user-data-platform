# Data Access Library

TypeScript library for DynamoDB operations with validation, error handling, and logging.

## Quick Start

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import {
  DynamoDbDataService,
  DynamoDBRepository,
  DynamoDBEntity,
} from '@libs/data-access';

// Create DynamoDB Document Client outside the handler (connection pooling)
const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const repository = new DynamoDBRepository<DynamoDBEntity>(
  process.env.TABLE_NAME!,
  docClient,
);

const service = new DynamoDbDataService(repository);

// Lambda handler
export const handler = async (event: any) => {
  const userId = event.pathParameters.userId;
};

export const handler = async (event: any) => {
  // Get entity
  const data = await service.getByKey('user-123', 'topics');

  // Save entity
  await service.save({
    pk: 'user-123',
    sk: 'topics',
    data: { status: 'active' },
    ttl: Math.floor(Date.now() / 1000) + 86400,
  });

  return { statusCode: 200, body: JSON.stringify(data) };
};
```

## KMS encryption

```typescript
// Add encryption to dynamo service repository to auto encrypt and decrypt specified fields
const encryption = new EncryptionService({ kmsKeyId: KMS_KEY_ID });

const repository = new DynamoDBRepository<DynamoDBEntity>(
  process.env.TABLE_NAME!,
  docClient,
  { service: encryption, dataFields: ['data'] },
);
```

## DynamoDbDataService API

### `getByKey(pk: string, sk: string): Promise<T | null>`

**`getByKey(pk: string, sk: string): Promise<T | null>`**
Retrieves an entity by composite key.

**`save(entity: T): Promise<void>`**
Saves an entity with validation.

## Architecture

```
ServiceFactory → DynamoDb*Service → DynamoDBRepository → AWS SDK
```

## Error Handling

The library provides custom error types for error handling:

```typescript
import { GetError, SaveError, NotFoundError } from '@libs/data-access';

try {
  await service.save(entity);
} catch (error) {
  if (error instanceof SaveError) {
    console.error('Save failed:', error.message);
    console.error('Cause:', error.cause);
  }
}
```

## Error Types

- `GetError` - Retrieval operations
- `SaveError` - Save operations
- `NotFoundError` - Entity not found
- `RepositoryError` - Base error type
