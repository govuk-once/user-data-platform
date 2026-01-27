## User Data Platform

## Setup

### Prerequisites

- detect-secrets (for secret detection)

### Installation

1. Install dependencies:

```bash
pnpm install
```

2. Install pre-commit and security tools:

```bash
# macOS
brew install pre-commit detect-secrets

# Or using pip
pip install pre-commit detect-secrets
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
        successStatus: 201,
        dynamoDbActions: ['dynamodb:PutItem', 'dynamodb:GetItem', 'dynamodb:Query'], // set apropriate actions required
        authorizationScopes: ['udp/write'], // set scopes required in auth
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

### API Consumer Configuration

External consumers are onboarded by adding configuratuin to `cdk/cdk.json` and deploying , the stack automatically provisions Cognito credentials and stores them in Secrets Manager, and grants the consumer's AWS account read access to the secret.

#### 1. Add the conumer to `cdk/cdk.jdon`

Under the appropriate envireonment key, add an entry with consumer name and their aws account id and scopes

```json
{
  "context": {
    "externalConsumers:dev": {
      "partner-app": {
        "accountId": "234234234234",
        "description": "Partner application for data integration",
        "scopes": ["udp/read"]
      }
    }
  }
}
```

#### 2. Deploy

```bash
npx nx run cdk:deploy:dev
```

this creates:

- A cogntio M2M client with a `udp/read` scope
- A secrets manager secret at `/udp/dev/consumers/partner-app/config`
- OAuth2 client credentials
- auth endpoint details
- A resource policy granting `secretsmanager:GetSecretValue`

#### 3. Share the secret ARN with the new consumer

Share the `/udp/dev/consumers/partner-app/config` arn value with the consumer

#### 4 Consumer integration example

The consumer reads their secrets from Secret Manager, authenticated with cognito and calls the API

```typescript
import {
  SecretManagerClient,
  GetSecretValueCommand,
} from '@aws-cdk/client-secrets-manager';

interface ConsumerConfig {
  privateLinkServiceName: string;
  region: string;
  apiAccountId: string;
  availabilityZones: string;
  cognitoTokenEndpoint: string;
  cognitoUserPoolId: string;
  cognitoClientId: string;
  cognitoClientSecret: string;
  apiUrl: string;
}

async function getConsumerConfig(secretArn: string): Promise<ConsumerConfig> {
  const client = new SecretsManagerClient({});
  const { secretString } = await client.send(
    new GetSecretValueCommand({ secretId: secretArn }),
  );
}

export async function getAccessToken(config: ConsumerConfig): Promise<string> {
  const { tokenEndpoint } = config.cognito;

  const credentials = Buffer.from(
    `${clientConfig.clientId}:${clientConfig.clientSecret}`,
  ).toString('base64');

  const response = await fetch(tokenEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientConfig.clientId,
      scope: clientConfig.scopes.join(' '),
    }),
  });

  if (!response.ok) {
    // throw error
  }

  const { access_token } = (await response.json()) as { access_token: string };

  return access_token;
}

const callApi = (url, config, token) => {
  const result = fetch(`${config.apiUrl}/${url}`, {
    method: 'POST',
    headers: {
        Authorization: `Bearer ${token}`
    }
    body: '*'
  });
};

const config = getConsumerConfig(
  'arn:aws:secretmanager:eu-west-2:*******************', // ARN provided by UDP
);

const token = await getAccessToken(config);
const result = await callApi(config, token);
```
