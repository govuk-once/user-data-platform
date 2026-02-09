import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as kms from 'aws-cdk-lib/aws-kms';
import { RemovalPolicy } from 'aws-cdk-lib';
import { getRemovalPolicy } from 'cdk/constants/environment';

export interface LocalSecondaryIndexeConfig {
  readonly indexName: string;
  readonly sortKeyName: string;
  readonly sortKeyType?: dynamodb.AttributeType;
  readonly projectionType?: dynamodb.ProjectionType;
  readonly nonKeyAttributes?: string[];
}

export interface GlobalSecondaryIndexeConfig {
  readonly indexName: string;
  readonly partitionKeyName: string;
  readonly partitionKeyType?: dynamodb.AttributeType;
  readonly sortKeyName?: string;
  readonly sortKeyType?: dynamodb.AttributeType;
  readonly projectionType?: dynamodb.ProjectionType;
  readonly nonKeyAttributes?: string[];
}

export interface DynamoDBConstructProps {
  readonly developerId?: string;
  readonly environment: string;
  readonly tableName?: string;
  readonly partitionKey?: string;
  readonly sortKey?: string;
  readonly kmsKey?: kms.IKey;
  readonly pointInTimeRecovery?: boolean;
  readonly localSecondaryIndexes?: LocalSecondaryIndexeConfig[];
  readonly globalSecondaryIndexes?: GlobalSecondaryIndexeConfig[];
  readonly ttlAttributeName?: string;
}

export class DynamoDBConstruct extends Construct {
  public readonly table: dynamodb.Table;

  constructor(scope: Construct, id: string, props: DynamoDBConstructProps) {
    super(scope, id);

    const {
      developerId,
      environment,
      tableName = 'user-data-store',
      partitionKey = 'pk',
      sortKey = 'sk',
      kmsKey,
      pointInTimeRecovery = true,
      localSecondaryIndexes = [],
      globalSecondaryIndexes = [],
      ttlAttributeName,
    } = props;

    const fullTableName = developerId
      ? `${developerId}-${tableName}-${environment}`
      : `${tableName}-${environment}`;

    this.table = new dynamodb.Table(this, 'Table', {
      tableName: fullTableName,
      partitionKey: { name: partitionKey, type: dynamodb.AttributeType.STRING },
      sortKey: { name: sortKey, type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: kmsKey
        ? dynamodb.TableEncryption.CUSTOMER_MANAGED
        : dynamodb.TableEncryption.AWS_MANAGED,
      encryptionKey: kmsKey,
      pointInTimeRecoverySpecification: {
        pointInTimeRecoveryEnabled: pointInTimeRecovery,
      },
      removalPolicy: getRemovalPolicy(environment),
      timeToLiveAttribute: ttlAttributeName,
    });

    for (const lsiConfig of localSecondaryIndexes) {
      this.table.addLocalSecondaryIndex({
        indexName: lsiConfig.indexName,
        sortKey: {
          name: lsiConfig.sortKeyName,
          type: dynamodb.AttributeType.STRING,
        },
        ...(lsiConfig.projectionType && {
          projectionType: lsiConfig.projectionType,
        }),
        ...(lsiConfig.nonKeyAttributes && {
          nonKeyAttributes: lsiConfig.nonKeyAttributes,
        }),
      });
    }

    for (const gsiConfig of globalSecondaryIndexes) {
      this.table.addGlobalSecondaryIndex({
        indexName: gsiConfig.indexName,
        partitionKey: {
          name: gsiConfig.partitionKeyName,
          type: dynamodb.AttributeType.STRING,
        },
        ...(gsiConfig.sortKeyName && {
          sortKey: {
            name: gsiConfig.sortKeyName,
            type: dynamodb.AttributeType.STRING,
          },
        }),
        ...(gsiConfig.projectionType && {
          projectionType: gsiConfig.projectionType,
        }),
        ...(gsiConfig.nonKeyAttributes && {
          nonKeyAttributes: gsiConfig.nonKeyAttributes,
        }),
      });
    }
  }
}
