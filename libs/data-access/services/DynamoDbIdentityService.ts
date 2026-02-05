import {
  CreateUserInput,
  CreateUserResult,
  IdentityInput,
  IdentityRecordEntity,
} from '../types/Entity';
import { Logger } from '@libs/utils';
import { Repository } from '../repositories/Repository';
import createHttpError from 'http-errors';
import { v4 as uuidv4 } from 'uuid';

const PK_CONSTANT = 'IDENTITY_RECORD#';

/**
 * Service class for DynamoDB Identity entity operations with business logic.
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

  public async link(input: IdentityInput) {
    if (input.appId === input.serviceId) {
      throw createHttpError.BadRequest(
        'AppId and serviceId should not be the same',
      );
    }
    const entity = await this.createFromInput(input);
    this.validateEntity(entity);
    await this.repository.save(entity);
  }

  public async createAppUser(
    input: CreateUserInput,
  ): Promise<CreateUserResult> {
    const pk = `app#${input.appId}`;

    this.logger?.debug('checking is user exists', { pk });

    const exists = await this.repository.getByPk(pk);

    console.log({ exists });

    if (exists) {
      this.logger?.debug('User already exists', { pk });
      return { udpId: '', created: false };
    }

    const udpId = uuidv4();

    const entity = {
      pk,
      sk: udpId,
      udpId,
      serviceId: input.appId,
      serviceName: 'app',
      ...(input.ttl !== undefined ? { ttl: input.ttl } : {}),
    } as unknown as T;

    this.logger?.debug('Creating new app user', {
      pk,
      sk: udpId,
      appId: input.appId,
    });

    await this.repository.save(entity);

    this.logger?.debug('User successfully created', {
      pk,
      sk: udpId,
      appId: input.appId,
    });

    return { udpId, created: true };
  }

  public async create(input: IdentityInput) {
    const result = await this.getById(input.appId, false);
    if (result) return;

    const entity = await this.createFromInput({
      ...input,
    });
    this.validateEntity(entity);
    await this.repository.save(entity);
  }

  public async getById(serviceId: string, throwNotFound = true) {
    if (!serviceId) {
      throw createHttpError.BadRequest(
        `A valid identifier must be provided ${serviceId}`,
      );
    }

    const result = await this.repository.skBeginswith({
      pk: PK_CONSTANT,
      sk: serviceId,
    } as Partial<T>);

    if (!result) {
      if (throwNotFound) {
        throw createHttpError.NotFound('Identity record not found');
      }
      return null;
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
