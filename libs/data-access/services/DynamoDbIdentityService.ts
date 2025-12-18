import { IdentityInput, IdentityRecordEntity } from '../types/Entity';
import { Logger } from '@libs/utils';
import { Repository } from '../repositories/Repository';
import createHttpError from 'http-errors';
import { v4 as uuidv4 } from 'uuid';

const PK_CONSTANT = 'IDENTITY_RECORD#';

/**
 * Service class for DynamoDB entity operations with business logic.
 * Provides a higher-level API with validation, transformation, and orchestration.
 * Designed specifically for DynamoDB single-table design with composite keys.
 * @template T - The entity type that extends DynamoDBEntity
 */
export class DynamoDBIdentityService<T extends IdentityRecordEntity> {
  private readonly logger;

  constructor(
    private readonly repository: Repository<T>,
    logger?: Logger,
  ) {
    this.logger = logger;
  }

  public async create(input: IdentityInput) {
    const entity = await this.createFromInput(input);
    this.validateEntity(entity);
    await this.repository.save(entity);
  }

  public async getById(serviceId: string) {
    if (!serviceId) {
      throw createHttpError.BadRequest(`A valid identifier must be provided`);
    }

    const result = await this.repository.skBeginswith({
      pk: PK_CONSTANT,
      sk: serviceId,
    } as Partial<T>);

    if (!result) {
      throw createHttpError.NotFound('Identity record not found');
    }

    return result;
  }

  public async deleteById(serviceId: string) {
    if (!serviceId) {
      throw createHttpError.BadRequest(`A valid identifier must be provided`);
    }

    const identifier = await this.getById(serviceId);

    const result = await this.repository.delete({
      pk: PK_CONSTANT,
      sk: identifier.sk,
    } as Partial<T>);

    if (!result) {
      throw createHttpError.NotFound('Identity record not found');
    }

    return result;
  }

  private async createFromInput(input: IdentityInput): Promise<T> {
    if (!input.appId || !input.serviceId) {
      throw createHttpError.BadRequest(
        'Missing required field serviceId or appId',
      );
    }
    if (input.appId === input.serviceId) {
      // Assume this is the first record of type
      const udpId = uuidv4();
      return {
        pk: PK_CONSTANT,
        sk: `${input.serviceId}/${udpId}`,
        lsi_1: `${udpId}/${input.serviceId}`,
        udpId: uuidv4(),
        ...(input.ttl ? { ttl: input.ttl } : {}),
      } as T;
    }

    // look up the udp id by app id
    const appIdentifier = await this.getById(input.appId);

    return {
      pk: PK_CONSTANT,
      sk: `${input.serviceId}/${appIdentifier.udpId}`,
      lsi_1: `${appIdentifier.udpId}/${input.serviceId}`,
      serviceName: input.serviceName,
      serviceId: input.serviceId,
      udpId: appIdentifier.udpId,
      accessToken: input.accessToken,
      idToken: input.idToken,
      refreshToken: input.refreshToken,
      ...(input.ttl ? { ttl: input.ttl } : {}),
    } as T;
  }

  private validateEntity(entity: T) {
    if (!entity.sk) {
      throw createHttpError('Service Id must be set');
    }
  }
}
