import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { EncryptionService } from '../services/EncryptionService';
import { EncryptionConfig, IdentityRecordEntity } from '../types/Entity';
import { DynamoDBIdentityService } from '../services/DynamoDbIdentityService';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { DynamoDbDataService } from '../services/DynamoDbDataService';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Logger } from '@libs/utils';

export interface ServiceFactoryConfig {
  tableName: string;
  identityTableName: string;
  kmsKeyId?: string;
  tracer?: Tracer;
}

export class ServiceFactory {
  private tableName: string;
  private identityTableName: string;
  private kmsKeyId: string;
  private docClient: DynamoDBDocumentClient;
  private services: Map<string, unknown> = new Map();

  constructor(config: ServiceFactoryConfig) {
    this.identityTableName = config.identityTableName;
    this.tableName = config.tableName;
    this.kmsKeyId = config.kmsKeyId;

    const client = config.tracer
      ? config.tracer.captureAWSv3Client(new DynamoDBClient({}))
      : new DynamoDBClient({});
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
      this.identityTableName,
      this.docClient,
      encryption,
      console as unknown as Logger,
    );

    return new DynamoDBIdentityService(repository);
  }
}
