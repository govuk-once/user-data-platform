# Data Access Library

TypeScript library for DynamoDB operations with validation, error handling, and logging.

## Quick Start

```typescript
import { DynamoDbClient, Entity } from '@libs/data-access';

const client = new DynamoDbClient<Entity>(process.env.TABLE_NAME);
const service = client.getService();

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

## API

**`getByKey(pk: string, sk: string): Promise<T | null>`**  
Retrieves an entity by composite key.

**`save(entity: T): Promise<void>`**  
Saves an entity with validation.

## Architecture

```
DynamoDbClient → DynamoDbService → DynamoDBRepository → AWS SDK
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
