# Data Access Library

TypeScript library for the platform's DynamoDB operations, with field-level KMS
encryption, error handling, and logging.

Each entity has its own focused service (`data`, `identity`, `sar`). A service
owns the DynamoDB queries it needs and nothing more — there is no generic
repository layer to wire up. The `ServiceFactory` builds and caches the
services, sharing a single DynamoDB document client.

## Quick Start

```typescript
import { ServiceFactory } from '@libs/data-access';

// Create the factory once, outside the handler (connection pooling)
const factory = new ServiceFactory({
  tableName: process.env.TABLE_NAME!,
  identityTableName: process.env.IDENTITY_TABLE_NAME!,
  kmsKeyId: process.env.KMS_KEY_ID, // optional — enables field encryption
  tracer,
  logger,
});

export const handler = async (event: any) => {
  const identity = await factory
    .getService('identity')
    .getByServiceId(
      event.headers['requesting-service'],
      event.headers['requesting-service-user-id'],
    );

  const data = await factory
    .getService('data')
    .getByKey(identity, event.pathParameters.resourcePath);

  return { statusCode: 200, body: JSON.stringify(data) };
};
```

## KMS encryption

Pass a `kmsKeyId` to the factory and the configured fields are transparently
encrypted on write and decrypted on read (`data` for the data service,
the token fields for identity, `presignedURL` for SAR). Omit it and items are
stored as-is. The shared `encryptItem` / `decryptItem` helpers
(`services/crypto.ts`) apply this consistently across every service.

## Services

- **`getService('data')`** → `DynamoDbDataService` — `save`, `getByKey`,
  `patchByKey`, `deleteByKey`, `countByUdpID`, `getKeyPageByUdpID`,
  `getAllByUdpID`.
- **`getService('identity')`** → `DynamoDBIdentityService` — `createAppUser`,
  `linkIdentity`, `getByServiceId`, `getLinkedIdentity`, `deleteById`,
  `deleteAllByUdpId`.
- **`getService('sar')`** → `SarService` — `get`, `save`.

## Architecture

```
ServiceFactory → { DataService, IdentityService, SarService } → AWS SDK
```

## Error Handling

Services throw the platform's typed errors (from `@libs/utils`) — for example
`DataRecordNotFoundError` and `IdentityRecordNotFoundError` — which the Lambda
error-handling middleware maps to HTTP responses.
