import {
  CreateUserInput,
  CreateUserResult,
  IdentityInput,
  IdentityRecordEntity,
} from '../types/Entity';
import {
  IdentityLinkingInvalidIdentitesError,
  IdentityRecordNotFoundError,
  Logger,
  UDP_ERROR_TYPES,
} from '@libs/utils';
import { Repository } from '../repositories/Repository';
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

  public async linkIdentity(input: IdentityInput) {
    if (input.appId === input.serviceId) {
      throw new IdentityLinkingInvalidIdentitesError(
        'The provided AppId and ServiceId for linking should not be the same value',
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
        input.appId,
        input.serviceId,
      );
    }
    const entity = await this.createFromInput(input);
    await this.repository.save(entity);
  }

  public async createAppUser(
    input: CreateUserInput,
  ): Promise<CreateUserResult> {
    const pk = `app#${input.appId}`;

    this.logger?.debug('checking is user exists', { pk });

    const exists = await this.repository.getByPk(pk);

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

  public async getByServiceId(serviceName: string, serviceId: string) {
    const pk = `${serviceName.toLowerCase()}#${serviceId}`;

    this.logger?.debug('Getting service user', { pk });

    const user = await this.repository.getByPk(pk);

    if (!user) {
      throw new IdentityRecordNotFoundError(
        `Identity not found with service: ${serviceName} and id: ${serviceId}`,
        UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
        serviceName,
        serviceId,
      );
    }

    return user;
  }

  public async deleteById(serviceName: string, serviceId: string) {
    const identifier = await this.getByServiceId(serviceName, serviceId);

    const result = await this.repository.delete({
      pk: identifier.pk,
      sk: identifier.sk,
    } as Partial<T>);

    if (!result) {
      throw new IdentityRecordNotFoundError(
        `Identity not found with service: ${serviceName} and id: ${serviceId}`,
        UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
        serviceName,
        serviceId,
      );
    }

    return result;
  }

  private async createFromInput(input: IdentityInput): Promise<T> {
    // look up the udp id by app id
    const appIdentifier = await this.getByServiceId('app', input.appId);

    return {
      pk: `${input.serviceName}#${input.serviceId}`,
      sk: appIdentifier.udpId,
      serviceName: input.serviceName,
      serviceId: input.serviceId,
      udpId: appIdentifier.udpId,
      ...(input.ttl ? { ttl: input.ttl } : {}),
    } as T;
  }
}
