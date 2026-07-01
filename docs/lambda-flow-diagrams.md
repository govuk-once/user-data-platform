# Lambda Business Logic Flowcharts

Visual documentation of the business logic, validation, decision trees, and error handling within each Lambda function in the User Data Platform.

## Table of Contents

- [Shared Middleware Pipeline](#shared-middleware-pipeline)
- [Error Handling](#error-handling)
- [Identity Management](#identity-management)
  - [createUserLambda](#createuserlambda)
  - [createIdentityLambda](#createidentitylambda)
  - [readIdentityLambda](#readidentitylambda)
  - [exchangeIdentityLambda](#exchangeidentitylambda)
  - [getAllLinkedServiceLambda](#getalllinkedservicelambda)
  - [deleteIdentityLambda](#deleteidentitylambda)
- [Data Management](#data-management)
  - [postDataLambda](#postdatalambda)
  - [getDataLambda](#getdatalambda)
  - [patchDataLambda](#patchdatalambda)
  - [deleteDataLambda](#deletedatalambda)
- [SAR Pipeline (Subject Access Request)](#sar-pipeline-subject-access-request)
  - [SAR Pipeline Overview](#sar-pipeline-overview)
  - [startSarLambda](#startsarlambda)
  - [createSarFileLambda](#createsarfilelambda)
  - [generateSarPresignedUrlLambda](#generatesarpresignedurllambda)
  - [getSarStatusLambda](#getsarstatuslambda)
- [DSAR Pipeline (Data Subject Access Request / Deletion)](#dsar-pipeline-data-subject-access-request--deletion)
  - [DSAR Pipeline Overview](#dsar-pipeline-overview)
  - [startDsarLambda](#startdsarlambda)
  - [dsarRequestLambda](#dsarrequestlambda)
  - [dsarDeleteLambda](#dsardeletelambda)

---

## Shared Middleware Pipeline

All API Gateway Lambdas use the [Middy](https://middy.js.org/) middleware framework. The middleware chain runs `before` hooks top-to-bottom on the request, then `after` hooks bottom-to-top on the response. The `onError` handler wraps the entire lifecycle.

```mermaid
flowchart TD
    classDef error fill:#f96,stroke:#333,color:#000
    classDef middleware fill:#e6f3ff,stroke:#333,color:#000
    classDef apigw fill:#FF9900,stroke:#333,color:#000
    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A([fa:fa-globe API Gateway Request]):::apigw --> B[[fa:fa-cog injectLambdaContext]]:::middleware

    B --> C[[fa:fa-cog captureLambdaHandler / X-Ray]]:::middleware

    C --> D[fa:fa-tag putAnnotation: stack]

    D --> E[[fa:fa-cog jsonBodyParser<br/>POST/PATCH only]]:::middleware

    E --> F[[fa:fa-check-circle zodValidator - before]]:::validate

    F --> G{Validation<br/>passes?}

    G -- Yes --> H[fa:fa-bolt Handler Logic]

    G -- No --> ERR1[fa:fa-times-circle ZodValidationError]:::error

    H --> I[[fa:fa-cog responseSanitizer<br/>strips: pk, sk, ttl,<br/>udpId, lsi, __dataKey]]:::middleware

    I --> J[[fa:fa-cog httpResponseSerializer<br/>JSON stringify]]:::middleware

    J --> K[[fa:fa-check-circle zodValidator - after<br/>response validation<br/>log only]]:::validate

    K --> L([fa:fa-globe API Gateway Response]):::apigw



    ERR1 --> M[[fa:fa-cog udpErrorHandling<br/>onError]]:::middleware

    H -- Error thrown --> M

    M --> L

```

> **Note:** SQS-triggered Lambdas (createSarFile, dsarRequest, dsarDelete) and the S3-triggered Lambda (generateSarPresignedUrl) use a minimal middleware stack: `injectLambdaContext` + `captureLambdaHandler` only.

---

## Error Handling

The `udpErrorHandling` middleware maps error types to HTTP responses:

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef response fill:#d4edda,stroke:#333,color:#000



    A([fa:fa-times-circle Error thrown]) --> B{Response already<br/>set?}

    B -- Yes --> EXIT([Return existing response])

    B -- No --> C{instanceof<br/>BaseUDPError?}

    C -- No --> D[fa:fa-times-circle 500 INTERNAL_SERVER_ERROR<br/>unexpected error of name: error.name]:::error

    C -- Yes --> E{Error type?}

    E -- ZodValidationError --> F[400 BAD_REQUEST<br/>errorPaths included]:::response

    E -- IdentityRecordNotFoundError --> G[404 IDENTITY_NOT_FOUND<br/>serviceName, serviceUserId]:::response

    E -- DataRecordNotFoundError --> H[404 DATA_NOT_FOUND<br/>serviceName, serviceUserId, resourcePath]:::response

    E -- SarNotFoundError --> I[404 SAR_NOT_FOUND<br/>sarId]:::response

    E -- Other BaseUDPError --> J[fa:fa-times-circle 500 INTERNAL_SERVER_ERROR]:::error

```

---

## Identity Management

### createUserLambda

**Route:** `POST /v1/user`

Creates a new app user. Silently succeeds if the user already exists (idempotent).

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A([fa:fa-globe POST /v1/user]):::apigw --> B[[fa:fa-check-circle Zod validates body:<br/>appId required]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[Build pk: app#appId]

    D --> E[fa:fa-database DynamoDB GetItem by pk]:::dynamo

    E --> F{User already<br/>exists?}

    F -- Yes --> G[Log: user exists<br/>Return created: false]

    F -- No --> H[Generate UUID for udpId]

    H --> I[fa:fa-database DynamoDB PutItem<br/>pk: app#appId<br/>sk: udpId]:::dynamo

    I --> J[Return created: true]

    G --> K([fa:fa-check 204 No Content]):::success

    J --> K

```

### createIdentityLambda

**Route:** `POST /v1/identity/{serviceName}/{identifier}`

Links a service identity to an existing app user. Validates that appId and serviceId are not the same.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe POST /v1/identity<br/>/serviceName/identifier"]):::apigw --> B[[fa:fa-check-circle Zod validates body + path params]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[Extract appId from body<br/>serviceId from path<br/>serviceName from path]

    D --> E{appId ===<br/>serviceId?}

    E -- Yes --> ERR2[fa:fa-times-circle 500 IdentityLinkingInvalidIdentitesError]:::error

    E -- No --> F[fa:fa-database Lookup app identity<br/>DynamoDB GetItem<br/>pk: app#appId]:::dynamo

    F --> G{App identity<br/>found?}

    G -- No --> ERR3[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    G -- Yes --> H[Extract udpId from<br/>app identity record]

    H --> I[fa:fa-database DynamoDB PutItem<br/>pk: serviceName#serviceId<br/>sk: udpId]:::dynamo

    I --> J([fa:fa-check 200 Identity successfully created]):::success

```

### readIdentityLambda

**Route:** `GET /v1/identity/{serviceName}/{identifier}`

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe GET /v1/identity<br/>/serviceName/identifier"]):::apigw --> B[[fa:fa-check-circle Zod validates path params]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[fa:fa-database DynamoDB GetItem<br/>pk: serviceName#identifier]:::dynamo

    D --> E{Identity<br/>found?}

    E -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    E -- Yes --> F[Sanitize response<br/>strip internal fields]

    F --> G([fa:fa-check 200 Identity record]):::success

```

### exchangeIdentityLambda

**Route:** `GET /v1/exchange-identity?requiredService={service}`

Looks up a linked identity for a different service via the `sk-index` GSI.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A([fa:fa-globe GET /v1/exchange-identity<br/>?requiredService=...]):::apigw --> B[[fa:fa-check-circle Zod validates headers<br/>+ query params]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[Extract requesting-service<br/>+ requesting-service-user-id<br/>from headers]

    D --> E[fa:fa-database Step 1: DynamoDB GetItem<br/>pk: serviceName#userId]:::dynamo

    E --> F{Requester<br/>identity found?}

    F -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    F -- Yes --> G[Extract udpId from<br/>requester identity]

    G --> H[fa:fa-database Step 2: Query GSI sk-index<br/>sk = udpId<br/>pk begins_with requiredService]:::dynamo

    H --> I{Linked identity<br/>found?}

    I -- No --> ERR3[fa:fa-times-circle 404 IDENTITY_NOT_FOUND<br/>for requiredService]:::error

    I -- Yes --> J[Sanitize response]

    J --> K([fa:fa-check 200 Linked identity record]):::success

```

### getAllLinkedServiceLambda

**Route:** `GET /v1/identity/{serviceName}/{serviceId}/linked-services`

Returns all service names linked to the same UDP user via the shared `udpId`.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe GET /v1/identity/linked-services<br/>/serviceName/serviceId"]):::apigw --> B[[fa:fa-check-circle Zod validates path params:<br/>serviceName + serviceId required]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[fa:fa-database Step 1: DynamoDB GetItem<br/>pk: serviceName#serviceId]:::dynamo

    D --> E{Identity<br/>found?}

    E -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    E -- Yes --> F[Extract udpId from record]

    F --> G[fa:fa-database Step 2: Query GSI sk-index<br/>sk = udpId]:::dynamo

    G --> H{Linked records<br/>returned?}

    H -- No --> I[Log: no linked services found<br/>Return empty array]

    H -- Yes --> J[Map records → extract serviceName<br/>from each]

    I --> K([fa:fa-check 200 linkedServices array]):::success

    J --> K

```

### deleteIdentityLambda

**Route:** `DELETE /v1/identity/{serviceName}/{identifier}`

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe DELETE /v1/identity<br/>/serviceName/identifier"]):::apigw --> B[[fa:fa-check-circle Zod validates path params]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[fa:fa-database DynamoDB GetItem<br/>pk: serviceName#identifier]:::dynamo

    D --> E{Identity<br/>found?}

    E -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    E -- Yes --> F[fa:fa-database DynamoDB DeleteItem<br/>pk + sk]:::dynamo

    F --> G{Delete<br/>succeeded?}

    G -- No --> ERR3[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    G -- Yes --> H([fa:fa-check 200 Successfully Deleted Identity]):::success

```

---

## Data Management

### postDataLambda

**Route:** `POST /v1/data/{resourcePath}`

Stores user data against an identity. Supports optional TTL configuration.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe POST /v1/data/resourcePath"]):::apigw --> B[[fa:fa-check-circle Zod validates headers,<br/>path params, body]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[Extract requesting-service<br/>headers]

    D --> E[fa:fa-database Identity lookup<br/>DynamoDB GetItem<br/>pk: serviceName#userId]:::dynamo

    E --> F{Identity<br/>found?}

    F -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    F -- Yes --> G[Build entity:<br/>pk = udpId<br/>sk = resourcePath]

    G --> H{Configuration<br/>has expiresAt?}

    H -- Yes --> I[Set TTL on entity]

    H -- No --> J[No TTL]

    I --> K[fa:fa-database DynamoDB PutItem]:::dynamo

    J --> K

    K --> L[fa:fa-tag putAnnotation: putEntitySuccess]

    L --> M[Sanitize response]

    M --> N([fa:fa-check 200 Saved record]):::success

```

### getDataLambda

**Route:** `GET /v1/data/{resourcePath}`

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe GET /v1/data/resourcePath"]):::apigw --> B[[fa:fa-check-circle Zod validates headers<br/>+ path params]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[fa:fa-database Identity lookup<br/>pk: serviceName#userId]:::dynamo

    D --> E{Identity<br/>found?}

    E -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    E -- Yes --> F[fa:fa-database DynamoDB GetItem<br/>pk: udpId, sk: resourcePath]:::dynamo

    F --> G{Data record<br/>found?}

    G -- No --> ERR3[fa:fa-times-circle 404 DATA_NOT_FOUND]:::error

    G -- Yes --> H[Sanitize response]

    H --> I([fa:fa-check 200 Data entity]):::success

```

### patchDataLambda

**Route:** `PATCH /v1/data/{resourcePath}`

Performs a deep merge of the request body with the existing data record. Objects are recursively merged; primitives and arrays are overwritten.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe PATCH /v1/data/resourcePath"]):::apigw --> B[[fa:fa-check-circle Zod validates headers,<br/>path params, body]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[fa:fa-database Identity lookup<br/>pk: serviceName#userId]:::dynamo

    D --> E{Identity<br/>found?}

    E -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    E -- Yes --> F[fa:fa-database DynamoDB GetItem<br/>pk: udpId, sk: resourcePath]:::dynamo

    F --> G{Existing record<br/>found?}

    G -- No --> ERR3[fa:fa-times-circle 404 DATA_NOT_FOUND]:::error

    G -- Yes --> H[Deep merge:<br/>for each key in new data]

    H --> I{Both old and new<br/>values are plain<br/>objects?}

    I -- Yes --> J[Recursively merge<br/>nested objects]

    I -- No --> K[New value<br/>overwrites old]

    J --> L[fa:fa-database DynamoDB UpdateItem<br/>with merged data]:::dynamo

    K --> L

    L --> M[fa:fa-tag putAnnotation: patchEntitySuccess]

    M --> N[Sanitize response]

    N --> O([fa:fa-check 200 Merged record]):::success

```

### deleteDataLambda

**Route:** `DELETE /v1/data/{resourcePath}`

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe DELETE /v1/data/resourcePath"]):::apigw --> B[[fa:fa-check-circle Zod validates headers<br/>+ path params]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[fa:fa-database Identity lookup<br/>pk: serviceName#userId]:::dynamo

    D --> E{Identity<br/>found?}

    E -- No --> ERR2[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    E -- Yes --> F[fa:fa-database DynamoDB DeleteItem<br/>pk: udpId, sk: resourcePath]:::dynamo

    F --> G{Record<br/>found?}

    G -- No --> ERR3[fa:fa-times-circle 404 DATA_NOT_FOUND]:::error

    G -- Yes --> H([fa:fa-check 200 Entity deleted successfully]):::success

```

---

## SAR Pipeline (Subject Access Request)

### SAR Pipeline Overview

The SAR pipeline generates a downloadable file containing all of a user's data. It spans four Lambdas connected via SQS and S3 events.

```mermaid

flowchart LR

    classDef lambda fill:#FF9900,stroke:#333,color:#000

    classDef sqs fill:#FF4F8B,stroke:#333,color:#fff

    classDef s3 fill:#3F8624,stroke:#333,color:#fff

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef apigw fill:#FF9900,stroke:#333,color:#000



    A([fa:fa-globe Client POST /v1/sar]):::apigw --> B[fa:fa-bolt startSarLambda<br/>Returns 202 + sarID]:::lambda

    B --> C[(fa:fa-envelope SQS<br/>sarQueue)]:::sqs

    C --> D[fa:fa-bolt createSarFileLambda<br/>Builds JSON file]:::lambda

    D --> E[(fa:fa-archive S3 Bucket<br/>sarID.json<br/>KMS encrypted)]:::s3

    D -. Error .-> F[(fa:fa-envelope SQS DLQ)]:::sqs

    E --> G[fa:fa-bolt generateSarPresignedUrlLambda<br/>Creates 7-day URL]:::lambda

    G --> H[(fa:fa-database DynamoDB<br/>SAR record<br/>with presigned URL)]:::dynamo



    I([fa:fa-globe Client GET /v1/sar/sarId]):::apigw --> J[fa:fa-bolt getSarStatusLambda<br/>Returns presigned URL]:::lambda

    J --> H

```

### startSarLambda

**Route:** `POST /v1/sar`

Initiates a Subject Access Request by sending a message to the SAR processing queue.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef sqs fill:#FF4F8B,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A([fa:fa-globe POST /v1/sar]):::apigw --> B[[fa:fa-check-circle Zod validates headers]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[Generate UUID for sarID]

    D --> E[Build SQS message:<br/>sarID, serviceName,<br/>serviceUserId]

    E --> F[fa:fa-envelope Send to SQS sarQueue]:::sqs

    F --> G[fa:fa-tag putAnnotation: sarRequestSuccess]

    G --> H([fa:fa-check 202 Accepted<br/>sarID in body]):::success

```

### createSarFileLambda

**Trigger:** SQS event from sarQueue (batch size: 1)

Collects all user data, sanitizes it, and uploads to S3. On error, manually sends the message to a DLQ rather than relying on SQS retry.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef sqs fill:#FF4F8B,stroke:#333,color:#fff

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef s3 fill:#3F8624,stroke:#333,color:#fff



    A([fa:fa-envelope SQS Message:<br/>sarID, serviceName,<br/>serviceUserId]):::sqs --> B[Parse SQS message body]

    B --> C[fa:fa-database Step 1: Identity lookup<br/>DynamoDB GetItem<br/>pk: serviceName#serviceUserId]:::dynamo

    C --> D{Identity<br/>found?}

    D -- No --> ERR[fa:fa-times-circle Catch error]:::error

    D -- Yes --> E[Extract udpId]

    E --> F[fa:fa-database Step 2: Query ALL data records<br/>DynamoDB QueryAll<br/>pk: udpId]:::dynamo

    F --> G[Step 3: Sanitize records<br/>Remove: pk, sk, ttl<br/>Add: resourcePath from sk]

    G --> H[Step 4: Serialize to JSON]

    H --> I[fa:fa-archive Step 5: S3 PutObject<br/>Key: sarID.json<br/>Encryption: aws:kms<br/>Metadata: udpid, sarid]:::s3

    I --> J[fa:fa-tag putAnnotation: sarFileCreated]

    J --> K([fa:fa-check Success - triggers<br/>S3 event]):::success



    ERR --> L[fa:fa-envelope Send original message<br/>to SQS DLQ]:::sqs

    L --> M[fa:fa-tag putAnnotation: sarFileFailed]

    M --> N([fa:fa-times-circle Error handled -<br/>message on DLQ]):::error

```

### generateSarPresignedUrlLambda

**Trigger:** S3 ObjectCreated event

Generates a pre-signed download URL and creates a SAR record in DynamoDB with expiry timestamps. On error, re-throws to trigger Lambda retry (different error strategy from createSarFileLambda).

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef s3 fill:#3F8624,stroke:#333,color:#fff

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff



    A([fa:fa-archive S3 ObjectCreated event<br/>sarID.json]):::s3 --> B[Decode S3 object key]

    B --> C[Extract sarID from key<br/>strip .json suffix]

    C --> D[fa:fa-archive S3 HeadObject<br/>fetch metadata]:::s3

    D --> E{udpId in<br/>metadata?}

    E -- No --> ERR1[fa:fa-times-circle Throw: Missing udpId<br/>in S3 metadata]:::error

    E -- Yes --> F[fa:fa-archive Generate pre-signed URL<br/>GetObject command<br/>Expiry: 7 days]:::s3

    F --> G[Calculate timestamps]

    G --> H[expiresAt = now + 7 days<br/>in milliseconds<br/>for presigned URL expiry]

    H --> I[ttl = now + 90 days<br/>in seconds<br/>for DynamoDB TTL]

    I --> J[Build SAR record:<br/>pk: udpId<br/>sk: SAR/sarID<br/>sarID, ttl, expiresAt<br/>presignedURL, bucket, objectKey]

    J --> K[fa:fa-database DynamoDB PutItem<br/>via SAR service]:::dynamo

    K --> L[fa:fa-tag putAnnotation: sarRecordCreated]

    L --> M([fa:fa-check Success]):::success



    ERR1 --> N[fa:fa-tag putAnnotation: sarRecordFailed]

    N --> O[fa:fa-times-circle Re-throw error<br/>triggers Lambda retry]:::error

```

### getSarStatusLambda

**Route:** `GET /v1/sar/{sarId}`

Retrieves the SAR record containing the pre-signed download URL.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A(["fa:fa-globe GET /v1/sar/sarId"]):::apigw --> B[[fa:fa-check-circle Zod validates headers<br/>+ path params]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D{sarId present<br/>in path?}

    D -- No --> ERR2[fa:fa-times-circle 404 SAR_NOT_FOUND<br/>SAR ID is required]:::error

    D -- Yes --> E[fa:fa-database Identity lookup<br/>pk: serviceName#userId]:::dynamo

    E --> F{Identity<br/>found?}

    F -- No --> ERR3[fa:fa-times-circle 404 IDENTITY_NOT_FOUND]:::error

    F -- Yes --> G[fa:fa-database DynamoDB GetItem<br/>pk: udpId<br/>sk: SAR/sarId]:::dynamo

    G --> H{SAR record<br/>found?}

    H -- No --> ERR4[fa:fa-times-circle 404 SAR_NOT_FOUND]:::error

    H -- Yes --> I[fa:fa-tag putAnnotation: sarRecordFound]

    I --> J[Sanitize response]

    J --> K([fa:fa-check 200<br/>sarID, expiresAt,<br/>presignedUrl]):::success

```

---

## DSAR Pipeline (Data Subject Access Request / Deletion)

### DSAR Pipeline Overview

The DSAR pipeline deletes all of a user's data and identity records. It uses batched pagination to handle large datasets.

```mermaid

flowchart LR

    classDef lambda fill:#FF9900,stroke:#333,color:#000

    classDef sqs fill:#FF4F8B,stroke:#333,color:#fff

    classDef apigw fill:#FF9900,stroke:#333,color:#000



    A([fa:fa-globe Client POST /v1/dsar]):::apigw --> B[fa:fa-bolt startDsarLambda<br/>Returns 202 + dsarID]:::lambda

    B --> C[(fa:fa-envelope SQS<br/>dsarQueue)]:::sqs

    C --> D[fa:fa-bolt dsarRequestLambda<br/>Paginates + batches keys]:::lambda

    D -- Batch 1 --> E[(fa:fa-envelope SQS<br/>dsarDeleteQueue)]:::sqs

    D -- Batch 2 --> E

    D -- Batch N --> E

    E --> F[fa:fa-bolt dsarDeleteLambda<br/>Deletes data + identities]:::lambda

```

### startDsarLambda

**Route:** `POST /v1/dsar`

Initiates a Data Subject Access Request (deletion) by sending a message to the DSAR processing queue.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef apigw fill:#FF9900,stroke:#333,color:#000

    classDef sqs fill:#FF4F8B,stroke:#333,color:#fff

    classDef validate fill:#e6f3ff,stroke:#333,color:#000



    A([fa:fa-globe POST /v1/dsar]):::apigw --> B[[fa:fa-check-circle Zod validates headers]]:::validate

    B --> C{Validation<br/>passes?}

    C -- No --> ERR1[fa:fa-times-circle 400 BAD_REQUEST]:::error

    C -- Yes --> D[Generate UUID for dsarID]

    D --> E[Build SQS message:<br/>dsarID, serviceName,<br/>serviceUserId]

    E --> F[fa:fa-envelope Send to SQS dsarQueue]:::sqs

    F --> G[fa:fa-tag putAnnotation: dsarRequestSuccess]

    G --> H([fa:fa-check 202 Accepted<br/>dsarID in body]):::success

```

### dsarRequestLambda

**Trigger:** SQS event from dsarQueue (batch size: 1)

Looks up all data keys for a user and sends them in batches of 100 to the delete queue. Short-circuits if no data exists.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef sqs fill:#FF4F8B,stroke:#333,color:#fff

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff



    A([fa:fa-envelope SQS Message:<br/>dsarID, serviceName,<br/>serviceUserId]):::sqs --> B[Parse SQS message body]

    B --> C[fa:fa-database Identity lookup<br/>DynamoDB GetItem<br/>pk: serviceName#serviceUserId]:::dynamo

    C --> D{Identity<br/>found?}

    D -- No --> ERR[fa:fa-times-circle Error thrown]:::error

    D -- Yes --> E[Extract udpId]

    E --> F[fa:fa-database Count total data items<br/>DynamoDB Select: COUNT<br/>pk: udpId]:::dynamo

    F --> G{totalItems<br/>== 0?}

    G -- Yes --> H[Log: no data found<br/>Skip to next record]

    H --> EXIT([fa:fa-check Done - nothing to delete]):::success

    G -- No --> I[Calculate totalBatches<br/>= ceil totalItems / 100]

    I --> J[Set batchNumber = 1<br/>lastEvaluatedKey = undefined]

    J --> K[fa:fa-database Query key page<br/>DynamoDB Query pk: udpId<br/>Limit: 100<br/>startKey: lastEvaluatedKey]:::dynamo

    K --> L[Build batch message:<br/>dsarID, serviceName,<br/>serviceUserId, batchNumber,<br/>totalBatches, keys]

    L --> M[fa:fa-envelope Send batch to SQS<br/>dsarDeleteQueue]:::sqs

    M --> N[Log batch sent<br/>batchNumber++]

    N --> O{lastEvaluatedKey<br/>exists?}

    O -- Yes --> K

    O -- No --> P([fa:fa-check All batches sent]):::success

```

### dsarDeleteLambda

**Trigger:** SQS event from dsarDeleteQueue (batch size: 1)

Deletes data records key-by-key, tolerating already-deleted items. After all data is deleted, removes all linked identity records.

```mermaid

flowchart TD

    classDef error fill:#f96,stroke:#333,color:#000

    classDef success fill:#d4edda,stroke:#333,color:#000

    classDef warn fill:#fff3cd,stroke:#333,color:#000

    classDef sqs fill:#FF4F8B,stroke:#333,color:#fff

    classDef dynamo fill:#3B48CC,stroke:#333,color:#fff



    A([fa:fa-envelope SQS Message:<br/>dsarID, batchNumber,<br/>totalBatches, keys]):::sqs --> B[Parse SQS message body]

    B --> C[Set deletedCount = 0]

    C --> D[For each key in batch]

    D --> E[fa:fa-database DynamoDB DeleteItem<br/>pk: key.pk, sk: key.sk]:::dynamo

    E --> F{Delete<br/>succeeded?}

    F -- Yes --> G[deletedCount++]

    F -- DataNotFoundError --> H[fa:fa-exclamation-triangle Log warning:<br/>item not found<br/>Continue]:::warn

    F -- Other error --> ERR[fa:fa-times-circle Re-throw error]:::error

    G --> I{More keys<br/>in batch?}

    H --> I

    I -- Yes --> D

    I -- No --> J[Log: batch complete<br/>deletedCount]

    J --> K[Extract udpId from<br/>keys 0 .pk]

    K --> L[fa:fa-database Query all identities<br/>by sk = udpId]:::dynamo

    L --> M[fa:fa-database Delete each identity<br/>record]:::dynamo

    M --> N{ConditionalCheck<br/>Failed?}

    N -- Yes --> O[fa:fa-exclamation-triangle Log warning,<br/>continue]:::warn

    N -- No error --> P[Identity deleted]

    O --> Q{More<br/>identities?}

    P --> Q

    Q -- Yes --> M

    Q -- No --> R[Log: identity records deleted]

    R --> S([fa:fa-check Batch complete]):::success
```
