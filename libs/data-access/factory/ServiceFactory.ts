import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Logger } from '@libs/utils';
import { EncryptionService } from '../services/EncryptionService';
import { DynamoDbDataService } from '../services/DynamoDbDataService';
import { DynamoDBIdentityService } from '../services/DynamoDbIdentityService';
import { SarService } from '../services/SarService';
import { EncryptionConfig } from '../types/Entity';

export interface ServiceFactoryConfig {
  tableName: string;
  identityTableName: string;
  kmsKeyId?: string;
  tracer?: Tracer;
  logger?: Logger;
}

/**
 * Builds and caches the data-access services, sharing a single DynamoDB
 * document client across them. Each service is created lazily on first use.
 */
export class ServiceFactory {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly services = new Map<string, unknown>();

  constructor(private readonly config: ServiceFactoryConfig) {
    const client = config.tracer
      ? config.tracer.captureAWSv3Client(new DynamoDBClient({}))
      : new DynamoDBClient({});

    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  getService(name: 'data'): DynamoDbDataService;
  getService(name: 'identity'): DynamoDBIdentityService;
  getService(name: 'sar'): SarService;
  public getService(name: string): unknown {
    if (!this.services.has(name)) {
      this.services.set(name, this.createService(name));
    }
    return this.services.get(name);
  }

  private createService(name: string) {
    switch (name) {
      case 'data':
        return new DynamoDbDataService(
          this.docClient,
          this.config.tableName,
          this.encryptionFor(['data']),
          this.config.logger,
        );
      case 'identity':
        if (!this.config.identityTableName) {
          throw new Error('missing identity table');
        }
        return new DynamoDBIdentityService(
          this.docClient,
          this.config.identityTableName,
          this.encryptionFor(['accessToken', 'idToken', 'refreshToken']),
          this.config.logger,
        );
      case 'sar':
        return new SarService(
          this.docClient,
          this.config.tableName,
          this.encryptionFor(['presignedURL']),
          this.config.logger,
        );
      default:
        throw new Error(`Unknown Service: ${name}`);
    }
  }

  private encryptionFor(dataFields: string[]): EncryptionConfig | undefined {
    if (!this.config.kmsKeyId) {
      return undefined;
    }

    return {
      service: new EncryptionService({ kmsKeyId: this.config.kmsKeyId }),
      dataFields,
    };
  }
}
