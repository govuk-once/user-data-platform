## User Data Platform

## Setup

### Prerequisites

- detect-secrets (for secret detection)

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Install pre-commit, test and security tools:

```bash
# macOS
brew install pre-commit detect-secrets aws-sam-cli

# Or using pip
pip install pre-commit detect-secrets aws-sam-cli
```

3. Install the git hook scripts:

```bash
# Install pre-commit hooks
pre-commit install

# Install pre-push hooks (runs affected tests)
pre-commit install --hook-type pre-push
```

### Pre-commit Hooks

The project uses pre-commit hooks to maintain code quality. Hooks run automatically on `git commit`:

**On every commit:**

- Trailing whitespace removal
- End-of-file fixing
- YAML/JSON validation
- Large file detection
- Merge conflict detection
- Private key detection
- **Secret detection** (passwords, API keys, tokens via `detect-secrets`)
- Prettier formatting
- ESLint linting
- TypeScript type checking

## pre-commit

To run all hooks manually:

```bash
# Run all pre-commit hooks
pre-commit run --all-files

# Run specific hook
pre-commit run eslint --all-files
pre-commit run detect-secrets --all-files
```

**On git push:**

- Run all unit tests (via `vitest run`)

## Feature flags (AppConfig)

AppConfig is provisioned as part of the main CDK stack. Feature flags are stored as a hosted configuration profile using the AppConfig feature flag format.

### Adding a new feature flag per environment

1. Update the environment-specific feature flag map:
   - [cdk/constants/appconfig-feature-flags.ts](cdk/constants/appconfig-feature-flags.ts)
   - Add a new flag under `featureFlagsByEnvironment` and set `enabled` per environment.

2. Deploy the stack for the target environment:
   - The AppConfig deployment is created automatically when the stack updates.

### Example

In [cdk/constants/appconfig-feature-flags.ts](cdk/constants/appconfig-feature-flags.ts), `enableNewIdentityFlow` is enabled for `dev`, but disabled for `stag` and `prod`.

To introduce a new flag:

- Add the flag definition to each environment block (same name, different `enabled` values).
- Redeploy the target environment.

Use [Powertools](https://docs.aws.amazon.com/powertools/typescript/1.16.0/api/functions/_aws_lambda_powertools_parameters.appconfig.getAppConfig.html) to access the value in the Lambda handler code:

```ts
import { getAppConfig } from '@aws-lambda-powertools/parameters/appconfig';

export const handler = async (): Promise<void> => {
  // Retrieve a configuration profile
  const encodedConfig = await getAppConfig('my-config', {
    application: 'my-app',
    environment: 'prod',
  });
  const config = new TextDecoder('utf-8').decode(encodedConfig);
};
```

#### Managing Detected Secrets

If `detect-secrets` flags a false positive:

```bash
# Audit the baseline and mark false positives
detect-secrets audit .secrets.baseline

# Update the baseline with new findings
detect-secrets scan --baseline .secrets.baseline
```

## Running tests use the following commands

To test the get data lambda the command: nx run @src/getDataLambda:test
To test the post data lambda the command: nx run @src/postDataLambda:test

# Running a local build

To build the get data lambda the command: nx run @src/getDataLambda:build
To build the post data lambda the command: nx run @src/postDataLambda:build

# Running the e2e Tests

command: nx run @test/e2e:deploy-and-test will deploy the code to aws and run the feature tests against it
command: nx run @test/e2e:e2e will run the tests against currently deployed code.

# Folder Structure

```
| .github
    | deploy.yaml
| cdk
    | bin
    | constants
    | lib
        constructs
        stacks
    | scripts
    cdk.json
| libs
    | middleware-utils
        |...ts
        |...unit.test.ts
    | test-utils
        | ...ts
| src
    | getDataLambda
        handler.ts
        handler.unit.test.ts
    | postDataLambda
        handler.ts
| e2e
    | src
        | features
        | helpers
        | step-definitions

./build
    getDatalambda.js

.checkov
.semgrep
.prettier

.pre-commit

```

## Developer environments

Each developer gets an isolated AWS infrastructure environment to prevent resource collisions

### How it works

A unique developer ID is **auto-generated** from your git email and user

- Format: `<firstname>-<6-char-hash>` (eg `tim-b3b4n5`)
- The hash ensures uniqueness even if two devs have the same name
- All AWS resources are prefixed with this ID

### Usage

```sh
npx nx run @test/e2e:deploy-and-test
```

### API Endpoints

Api routes have been define in `libs/utils/routes.ts` this enables us to handle the automatic openapi documentation generation by keeping a central source of truth.

#### Adding New Endpoints

##### Define the Schemas

add your request and response schemas in `libs/utils/schemas/*.ts`
and ensure you add the OpenApi definitions to the schmma

```typescript
export const MyParamsSChema = z.object({
    userId: z.string().openapi({
        description: 'User id'
        example: '123'
    })
})
```

##### register the route in `libs/utils/routes.ts`

```typescript
export routes = {
    newRoute: {
        name: 'newRoute',
        path: '/new/{routId}',
        method: 'POST',
        summary: 'Summary for docs',
        description: 'Description for docs',
        tags: ['tag-for-docs-grouping'],
        params: ParamsSchema,
        body: BodySchema,
        response: ResponseSchema,
        dynamoDbActions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'], // set apropriate actions required
        authorizationScopes: ['udp/write'], // set scopes required in auth
        successResponses: [
          {
            status: 200,
            schema: ResponseSchema,
          },
        ],
    }
}
```

#### use the schemas in your lambda

using the middy zodValidator apply youy schemas to the lambda

```typescript
  .use(zodValidator({pathParameters: route.newRoute.params, body: route.newRoute.body }))
```

#### OpenAPI Docs

There is a pre-commit hook which will generate the openapi docs on pre-commit

if you would like to run and see them locally you can generate and serve them with

``nx run @udp:openapi`

### Connecting from an External Account

External consumers authenticate using **IAM (SigV4)** and call the API Gateway endpoint directly. There are no Cognito or OAuth credentials involved — access is controlled via cross-account IAM roles.

#### 1. UDP team steps (onboarding a consumer)

Add a consumer entry to `cdk/cdk.json` under the appropriate environment key:

```json
{
  "context": {
    "externalConsumers:dev": {
      "partner-app": {
        "accountId": "123456789012",
        "permissions": ["read", "write"],
        "externalId": "optional-external-id",
        "description": "Partner application for data integration",
        "vpcEndpointId": "vpce-0123456789abcdef0"
      }
    }
  }
}
```

| Field           | Required | Description                                                                                                                                                                                                      |
| --------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accountId`     | Yes      | The consumer's AWS account ID                                                                                                                                                                                    |
| `permissions`   | Yes      | Array of `"read"`, `"write"`, `"delete"`                                                                                                                                                                         |
| `externalId`    | No       | Additional STS assume-role security                                                                                                                                                                              |
| `description`   | No       | Human-readable label                                                                                                                                                                                             |
| `vpcEndpointId` | No       | The consumer's `execute-api` interface VPC endpoint ID. When provided, it is added to the API Gateway resource policy's `aws:sourceVpce` condition so the consumer can reach the private API from their own VPC. |

Deploy the stack:

```bash
npx nx run cdk:deploy:dev
```

This provisions:

- **IAM role** with a cross-account trust policy allowing the consumer account to assume it. The role grants `execute-api:Invoke` scoped to the HTTP methods matching the configured permissions (`read` → GET, `write` → POST/PUT/PATCH, `delete` → DELETE).
- **Secrets Manager secret** at `/udp/<env>/consumers/<name>/config` with a resource policy granting the consumer account `secretsmanager:GetSecretValue`.
- If a `vpcEndpointId` is provided, it is added to the API Gateway resource policy so the consumer can invoke the private API through their own `execute-api` interface VPC endpoint.

Share the secret ARN with the consumer.

#### 2. Consumer (external service) steps

##### Read the config secret

Use cross-account `secretsmanager:GetSecretValue` to retrieve the secret from the ARN provided by the UDP team:

```typescript
import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from '@aws-sdk/client-secrets-manager';

interface ConsumerConfig {
  region: string;
  apiAccountId: string;
  apiUrl: string;
  consumerRoleArn: string;
  externalId?: string;
}

async function getConsumerConfig(secretArn: string): Promise<ConsumerConfig> {
  const client = new SecretsManagerClient({
    region: process.env.AWS_REGION || 'eu-west-2',
  });

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretArn }),
  );

  if (!response.SecretString) {
    throw new Error('Consumer config secret is empty');
  }

  return JSON.parse(response.SecretString) as ConsumerConfig;
}
```

##### Assume the consumer IAM role and sign requests with SigV4

Use STS `AssumeRole` with the `consumerRoleArn` from the secret (and `externalId` if set), then sign each HTTP request using AWS Signature V4 for the `execute-api` service:

```typescript
import { Sha256 } from '@aws-crypto/sha256-js';
import { SignatureV4 } from '@smithy/signature-v4';
import { HttpRequest } from '@smithy/protocol-http';
import { fromTemporaryCredentials } from '@aws-sdk/credential-providers';

async function callApi(
  config: ConsumerConfig,
  method: string,
  path: string,
  body?: unknown,
) {
  const url = new URL(path, config.apiUrl);
  const bodyString = body ? JSON.stringify(body) : undefined;

  const request = new HttpRequest({
    method,
    protocol: url.protocol,
    hostname: url.hostname,
    path: url.pathname + url.search,
    headers: {
      host: url.host,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: bodyString,
  });

  const signer = new SignatureV4({
    credentials: fromTemporaryCredentials({
      params: {
        RoleArn: config.consumerRoleArn,
        RoleSessionName: 'consumer-session',
        ...(config.externalId && { ExternalId: config.externalId }),
      },
    }),
    region: config.region,
    service: 'execute-api',
    sha256: Sha256,
  });

  const signed = await signer.sign(request);

  return fetch(url.toString(), {
    method,
    headers: signed.headers as Record<string, string>,
    body: bodyString,
  });
}

// Usage
const config = await getConsumerConfig(
  'arn:aws:secretsmanager:eu-west-2:************:secret:/udp/dev/consumers/partner-app/config',
);

const response = await callApi(config, 'GET', '/users/123');
```

#### 3. Consumer secret schema reference

| Field             | Type      | Description                                                                  |
| ----------------- | --------- | ---------------------------------------------------------------------------- |
| `region`          | `string`  | AWS region where the API is deployed                                         |
| `apiAccountId`    | `string`  | AWS account ID that hosts the API                                            |
| `apiUrl`          | `string`  | Base URL of the API Gateway endpoint                                         |
| `consumerRoleArn` | `string`  | IAM role ARN to assume before calling the API                                |
| `externalId`      | `string?` | STS external ID required when assuming the role (only present if configured) |
