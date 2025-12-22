import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { EncryptionService } from '../services/EncryptionService';
import { EncryptionConfig, IdentityRecordEntity } from '../types/Entity';
import { DynamoDBIdentityService } from '../services/DynamoDbIdentityService';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDbDataService } from '../services/DynamoDbDataService';

export interface ServiceFactoryConfig {
  tableName: string;
  kmsKeyId?: string;
}

export class ServiceFactory {
  private tableName: string;
  private kmsKeyId: string;
  private docClient: DynamoDBDocumentClient;
  private services: Map<string, unknown> = new Map();

  constructor(config: ServiceFactoryConfig) {
    this.tableName = config.tableName;
    this.kmsKeyId = config.kmsKeyId;

    const client = new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  getService(name: 'data'): DynamoDbDataService;
  getService(name: 'identity'): DynamoDBIdentityService<IdentityRecordEntity>;
  public getService(name: string): unknown {
    if (!this.services.has(name)) {
      this.services.set(name, this.createService(name));
    }
    return this.services.get(name);
  }

  private createService(name: string) {
    switch (name) {
      case 'identity':
        return this.createIdentityService();
      case 'data':
        return this.createDataService();
      default:
        throw new Error(`Unknown Service: ${name}`);
    }
  }

  private getEncryptionConfig(
    dataFields: string[],
  ): EncryptionConfig | undefined {
    if (this.kmsKeyId) {
      return {
        service: new EncryptionService({ kmsKeyId: this.kmsKeyId }),
        dataFields,
      };
    }
    return undefined;
  }

  private createDataService() {
    const encryption = this.getEncryptionConfig(['data']);
    const repository = new DynamoDBRepository<IdentityRecordEntity>(
      this.tableName,
      this.docClient,
      encryption,
    );

    return new DynamoDbDataService(repository);
  }

  private createIdentityService() {
    const encryption = this.getEncryptionConfig([
      'accessToken',
      'idToken',
      'refreshToken',
    ]);
    const repository = new DynamoDBRepository<IdentityRecordEntity>(
      this.tableName,
      this.docClient,
      encryption,
    );

    return new DynamoDBIdentityService(repository);
  }
}
