import { DataRecordNotFoundError, Logger, UDP_ERROR_TYPES } from '@libs/utils';
import { Repository } from '../repositories/Repository';
import {
  DataInput,
  DynamoDBDataEntity,
  IdentityRecordEntity,
} from '../types/Entity';

/**
 * Service class for DynamoDB Data entity operations with business logic.
 * Provides a higher-level API with validation, transformation, and orchestration.
 * Designed specifically for DynamoDB single-table design with composite keys.
 * @template T - The entity type that extends DynamoDBEntity
 */
export class DynamoDbDataService {
  private readonly logger;

  constructor(
    private readonly repository: Repository<DynamoDBDataEntity>,
    logger?: Logger,
  ) {
    this.logger = logger;
  }

  public async save(
    identity: IdentityRecordEntity,
    resourcePath: string,
    input: DataInput,
  ) {
    const entity = await this.createFromInput(identity, resourcePath, input);
    await this.repository.save(entity);
  }

  public async getByKey(identity: IdentityRecordEntity, resourcePath: string) {
    const result = await this.repository.get({
      pk: identity.udpId,
      sk: resourcePath,
    });

    if (!result) {
      throw new DataRecordNotFoundError(
        `Resource not found on path ${resourcePath}: for identity ${identity.serviceName}#${identity.serviceId}`,
        UDP_ERROR_TYPES.DATA_NOT_FOUND,
        identity.serviceName,
        identity.serviceId,
        resourcePath,
      );
    }

    return result;
  }

  public async deleteByKey(
    identity: IdentityRecordEntity,
    resourcePath: string,
  ) {
    const result = await this.repository.delete({
      pk: identity.udpId,
      sk: resourcePath,
    });

    if (!result) {
      throw new DataRecordNotFoundError(
        `Resource not found on path ${resourcePath}: for identity ${identity.serviceName}#${identity.serviceId}`,
        UDP_ERROR_TYPES.DATA_NOT_FOUND,
        identity.serviceName,
        identity.serviceId,
        resourcePath,
      );
    }

    return result;
  }

  private createFromInput(
    identity: IdentityRecordEntity,
    resourcePath: string,
    input: DataInput,
  ): DynamoDBDataEntity {
    const data = input.data;
    const ttl = input.configuration
      ? (input.configuration.expiresAt ?? undefined)
      : undefined;
    return {
      pk: identity.udpId,
      sk: resourcePath,
      ...(data ? { data } : {}),
      ...(ttl ? { ttl } : {}),
    };
  }
}
