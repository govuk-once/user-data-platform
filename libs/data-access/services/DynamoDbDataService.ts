import { Logger } from '@libs/utils';
import { Repository } from '../repositories/Repository';
import {
  DataInput,
  DynamoDBDataEntity,
  IdentityRecordEntity,
} from '../types/Entity';
import createHttpError from 'http-errors';

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
    input: Record<string, unknown>,
  ) {
    this.validate(identity, resourcePath, input);
    const entity = await this.createFromInput(identity, resourcePath, input);
    await this.repository.save(entity);
  }

  public async getByKey(identity: IdentityRecordEntity, resourcePath: string) {
    this.validate(identity, resourcePath);

    const result = await this.repository.get({
      pk: identity.udpId,
      sk: resourcePath,
    });

    if (!result) {
      throw createHttpError.NotFound(
        `Resource with path ${resourcePath}:identity ${identity.serviceId} not found`,
      );
    }

    return result;
  }

  public async deleteByKey(
    identity: IdentityRecordEntity,
    resourcePath: string,
  ) {
    this.validate(identity, resourcePath);

    const result = await this.repository.delete({
      pk: identity.udpId,
      sk: resourcePath,
    });

    if (!result) {
      throw createHttpError.NotFound(
        `Resource with path ${resourcePath}:identity ${identity.serviceId} not found`,
      );
    }

    return result;
  }

  private createFromInput(
    identity: IdentityRecordEntity,
    resourcePath: string,
    input: DataInput,
  ): DynamoDBDataEntity {
    const { ttl, ...rest } = input;
    return {
      pk: identity.udpId,
      sk: resourcePath,
      data: rest,
      ...(ttl ? { ttl } : {}),
    };
  }

  private validate(
    identity: IdentityRecordEntity,
    resourcePath: string,
    input?: DataInput,
  ) {
    if (!identity.udpId) {
      throw createHttpError.BadRequest('Unable to resolve identity');
    }

    if (!resourcePath) {
      throw createHttpError.BadRequest(`resourcePath is required`);
    }

    if (input?.ttl !== undefined) {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      if (input.ttl <= nowInSeconds) {
        throw createHttpError.BadRequest(
          `TTL must be a future timestamp in seconds since epoch`,
        );
      }
    }
  }
}
