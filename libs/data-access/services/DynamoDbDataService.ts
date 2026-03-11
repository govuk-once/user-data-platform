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
    return await this.repository.save(entity);
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

  public async pathByKey(
    identity: IdentityRecordEntity,
    resourcePath: string,
    data: Record<string, unknown>,
  ) {
    const existing = await this.repository.get({
      pk: identity.udpId,
      sk: resourcePath,
    });

    if (!existing) {
      throw new DataRecordNotFoundError(
        `Resource not found on path ${resourcePath}: for identity ${identity.serviceName}#${identity.serviceId}`,
        UDP_ERROR_TYPES.DATA_NOT_FOUND,
        identity.serviceName,
        identity.serviceId,
        resourcePath,
      );
    }

    const mergeData = this.deepMerge(existing.data ?? {}, data);

    const result = await this.repository.update(
      { pk: identity.udpId, sk: resourcePath },
      mergeData,
    );

    return result;
  }

  private deepMerge(
    target: Record<string, unknown>,
    source: Record<string, unknown>,
  ): Record<string, unknown> {
    const result = { ...target };

    for (const key of Object.keys(source)) {
      const sourceVal = source[key];
      const targetVal = target[key];

      if (this.isPlainObject(sourceVal) && this.isPlainObject(targetVal)) {
        result[key] = this.deepMerge(
          targetVal as Record<string, unknown>,
          sourceVal as Record<string, unknown>,
        );
      } else {
        result[key] = sourceVal;
      }
    }

    return result;
  }

  private isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  public async countByUdpID(udpID: string): Promise<number> {
    return this.repository.countByPk(udpID);
  }

  public async getKeyPageByUdpID(
    udpID: string,
    lastEvaluatedKey?: Record<string, unknown>,
  ) {
    return this.repository.queryPageByPk(udpID, 100, lastEvaluatedKey);
  }

  public async getAllByUdpID(udpID: string): Promise<DynamoDBDataEntity[]> {
    return this.repository.queryAllByPk(udpID);
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
