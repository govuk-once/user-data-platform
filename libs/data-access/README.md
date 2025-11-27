# Data Access Library

## Quick Start for DynamoDB

```typescript
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { 
  DynamoDbService, 
  RepositoryFactory, 
  StoreType,
  CompositeKeyEntity 
} from '@libs/data-access';

// Create DynamoDB client outside the handler (connection pooling)
const client = new DynamoDBClient({});

const repository = RepositoryFactory.create<CompositeKeyEntity>(
  StoreType.DYNAMODB,
  { 
    tableName: process.env.TABLE_NAME!,
    client 
  }
);

const service = new DynamoDbService(repository);

// Lambda handler
export const handler = async (event: any) => {
  const userId = event.pathParameters.userId;

  // Get data
  const data = await service.getByKey(userId, 'topics');
  if (!data) {
    return { statusCode: 404, body: 'Not found' };
  }

  // Save data
  await service.save({
    pk: userId,
    sk: 'topics',
    data: { status: 'active' },
    ttl: Math.floor(Date.now() / 1000) + 86400, // 24 hours
  });

  return { statusCode: 200, body: JSON.stringify(data) };
};
```

## DynamoDbService API

### `getByKey(pk: string, sk: string): Promise<T | null>`

Retrieves an entity by composite key.

```typescript
const user = await service.getByKey('user-123', 'topics');
```

### `save(entity: T): Promise<void>`

Saves an entity with validation (pk, sk, ttl checks).

```typescript
await service.save({
  pk: 'user-123',
  sk: 'topics',
  data: { status: 'active' },
});
```

## Error Handling

```typescript
import { GetByIdError, SaveError } from '@libs/data-access';

try {
  await service.save(entity);
} catch (error) {
  if (error instanceof SaveError) {
    console.error('Save failed:', error.message);
    console.error('Cause:', error.cause);
  }
}
```
