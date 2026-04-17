import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { EncryptionService } from '../services/EncryptionService';
import {
  DynamoDBDataEntity,
  EncryptionConfig,
  IdentityRecordEntity,
  SAREntity,
} from '../types/Entity';
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
  logger?: Logger;
}

export class ServiceFactory {
  private tableName: string;
  private identityTableName?: string;
  private kmsKeyId: string;
  private docClient: DynamoDBDocumentClient;
  private services: Map<string, unknown> = new Map();
  private logger?: Logger;

  constructor(config: ServiceFactoryConfig) {
    this.identityTableName = config.identityTableName;
    this.tableName = config.tableName;
    this.kmsKeyId = config.kmsKeyId;

    this.logger = config.logger ?? (console as unknown as Logger);

    const client = config.tracer
      ? config.tracer.captureAWSv3Client(new DynamoDBClient({}))
      : new DynamoDBClient({});
    this.docClient = DynamoDBDocumentClient.from(client, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }

  getService(name: 'data'): DynamoDbDataService;
  getService(name: 'identity'): DynamoDBIdentityService<IdentityRecordEntity>;
  getService(name: 'sar'): DynamoDBRepository<SAREntity>;
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
      case 'sar':
        return this.createSARService();
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
    const repository = new DynamoDBRepository<DynamoDBDataEntity>(
      this.tableName,
      this.docClient,
      encryption,
      this.logger,
    );

    return new DynamoDbDataService(repository);
  }

  private createIdentityService() {
    if (!this.identityTableName) {
      throw Error('missing identity table');
    }

    const encryption = this.getEncryptionConfig([
      'accessToken',
      'idToken',
      'refreshToken',
    ]);
    const repository = new DynamoDBRepository<IdentityRecordEntity>(
      this.identityTableName,
      this.docClient,
      encryption,
      this.logger,
    );

    return new DynamoDBIdentityService(repository);
  }

  private createSARService() {
    const encryption = this.getEncryptionConfig(['presignedURL']);
    const repository = new DynamoDBRepository<SAREntity>(
      this.tableName,
      this.docClient,
      encryption,
      this.logger,
    );

    return repository;
  }
}
