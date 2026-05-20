import { DataRecordNotFoundError, Logger, UDP_ERROR_TYPES } from '@libs/utils';
import { Repository } from '../repositories/Repository';
import {
  DataInput,
  DynamoDBDataEntity,
  S3Entity,
  IdentityRecordEntity,
} from '../types/Entity';
import { S3Repository } from '../repositories/S3Repository';

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
    private readonly s3Repository: S3Repository<S3Entity>,
    logger?: Logger,
  ) {
    this.logger = logger;
  }

  public async save(
    identity: IdentityRecordEntity,
    resourcePath: string,
    input: DataInput,
  ) {
    const entity = this.createFromInput(identity, resourcePath, input);

    try {
      return await this.repository.save(entity);
    } catch (error) {
      const e = error as { name?: string; message?: string };

      if (
        e?.name === 'ValidationException' &&
        e?.message === 'Item size has exceeded the maximum allowed size'
      ) {
        const origEntity = { ...entity };
        try {
          return await this.repository.chunkSave(entity);
        } catch (chunkSaveError) {
          throw chunkSaveError;
        }
        // try {
        //   const { key, content } = await this.repository.s3Save(entity);
        //   await this.s3Repository.save(key, content);
        //   return origEntity;
        // } catch (s3SaveError) {
        //   throw s3SaveError;
        // }
      }

      throw error;
    }
  }

  public async getByKey(identity: IdentityRecordEntity, resourcePath: string) {
    let result = await this.repository.get({
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

    // if (this.resultIsS3(result)) {
    //   // Does result overflow into S3?
    //   result = await this.enrichFromS3(result);
    // }

    if (this.resultIsChunked(result)) {
      // Does the result need to be recompiled from chunks?
      result = await this.recompileFromChunks(identity, resourcePath, result);
    }

    return result;
  }

  public async patchByKey(
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

  private resultIsChunked(result: DynamoDBDataEntity) {
    return (
      '__chunked' in result &&
      result.__chunked &&
      'data' in result &&
      typeof result.data === 'string'
    );
  }

  private async recompileFromChunks(
    identity: IdentityRecordEntity,
    resourcePath: string,
    initialResult: DynamoDBDataEntity,
  ): Promise<DynamoDBDataEntity> {
    const result = initialResult;

    if (result.data && '__chunks' in initialResult && initialResult.__chunks) {
      try {
        for (let index = 1; index < initialResult.__chunks; index++) {
          const chunkedResult = await this.repository.get({
            pk: identity.udpId,
            sk: `${resourcePath}#chunk-${index}`,
          });

          if (chunkedResult?.data) {
            // @ts-ignore
            result.data += chunkedResult?.data;
          }
        }
      } catch (chunkError) {
        throw chunkError;
      }

      result.data = JSON.parse(result.data as unknown as string);
    }

    return result;
  }

  private resultIsS3(result: DynamoDBDataEntity) {
    return (
      '__chunked' in result &&
      result.__chunked &&
      'data' in result &&
      typeof result.data === 'string'
    );
  }

  private async enrichFromS3(
    result: DynamoDBDataEntity,
  ): Promise<DynamoDBDataEntity> {
    try {
      const s3Object = await this.s3Repository.get({
        key: result.data as unknown as string,
      });

      result.data = JSON.parse(s3Object.body as unknown as string);

      delete result.__s3;

      return result;
    } catch (s3SaveError) {
      throw s3SaveError;
    }
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
