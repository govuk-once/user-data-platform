import { describe, it, vi, beforeEach, expect } from 'vitest';
import {
  CreateUserInput,
  IdentityInput,
  IdentityRecordEntity,
} from '../types/Entity';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { DynamoDBIdentityService } from './DynamoDbIdentityService';
import createHttpError from 'http-errors';
import { GetError } from '../errors/Errors';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-string-uuid4'),
}));

describe('Identity Service', () => {
  let mockRepository: DynamoDBRepository<IdentityRecordEntity>;
  let service: DynamoDBIdentityService<IdentityRecordEntity>;

  beforeEach(() => {
    mockRepository = {
      get: vi.fn(),
      getByPk: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
      skBeginswith: vi.fn(),
    } as unknown as DynamoDBRepository<IdentityRecordEntity>;
    service = new DynamoDBIdentityService(mockRepository);
  });

  describe('Create App User', () => {
    it('should successfully add a new App user', async () => {
      const input: CreateUserInput = {
        appId: 'test',
      };

      const result = await service.createAppUser(input);

      expect(mockRepository.save).toHaveBeenCalledWith({
        pk: `app#test`,
        sk: 'mock-string-uuid4',
        serviceName: 'app',
        serviceId: 'test',
        udpId: 'mock-string-uuid4',
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);

      expect(result).toEqual({ created: true, udpId: 'mock-string-uuid4' });
    });

    it('should not create duplicate values', async () => {
      const input: CreateUserInput = {
        appId: 'test',
      };

      vi.mocked(mockRepository.getByPk).mockResolvedValue({
        pk: `app#test`,
        sk: 'mock-string-uuid4',
        serviceName: 'app',
        serviceId: 'test',
        udpId: 'mock-string-uuid4',
      });

      const result = await service.createAppUser(input);

      expect(mockRepository.save).not.toHaveBeenCalledWith({
        pk: `app#test`,
        sk: 'mock-string-uuid4',
        serviceName: 'app',
        serviceId: 'test',
        udpId: 'mock-string-uuid4',
      });
      expect(mockRepository.save).not.toHaveBeenCalledTimes(1);

      expect(result).toEqual({ created: false, udpId: '' });
    });
  });

  describe('Link Identity', () => {
    it('should link the identity if the user exists', async () => {
      const input: IdentityInput = {
        appId: 'test',
        serviceId: 'test-service-id',
        serviceName: 'test-service',
      };

      vi.mocked(mockRepository.getByPk).mockResolvedValue({
        pk: `app#test`,
        sk: 'mock-string-uuid4',
        serviceName: 'app',
        serviceId: 'test',
        udpId: 'mock-string-uuid4',
      });

      await service.linkIdentity(input);

      expect(mockRepository.save).toHaveBeenCalledWith({
        pk: `test-service#test-service-id`,
        sk: 'mock-string-uuid4',
        serviceName: 'test-service',
        serviceId: 'test-service-id',
        udpId: 'mock-string-uuid4',
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should return an error if the user doesnt exist', async () => {
      const input: IdentityInput = {
        appId: 'test',
        serviceId: 'test-service-id',
        serviceName: 'test-service',
      };

      vi.mocked(mockRepository.getByPk).mockResolvedValue(null);

      await expect(service.linkIdentity(input)).rejects.toThrow(
        'User not found',
      );
    });

  });

  describe('Get Identity Record', () => {
    it('Should return the Identity Record if it extists', async () => {
      const mockEntity: IdentityRecordEntity = {
        pk: 'IDENTITY_RECORD#',
        sk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        udpId: 'test-id',
        serviceId: 'test',
        serviceName: 'test',
      };

      vi.mocked(mockRepository.skBeginswith).mockResolvedValue(mockEntity);

      const result = await service.getById(
        'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      );

      expect(result).toEqual(mockEntity);
      expect(mockRepository.skBeginswith).toHaveBeenCalledWith({
        pk: 'IDENTITY_RECORD#',
        sk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      });
      expect(mockRepository.skBeginswith).toHaveBeenCalledTimes(1);
    });

    it('Should throw a NotFound Error if the Identity Record does not exist', async () => {
      vi.mocked(mockRepository.skBeginswith).mockResolvedValue(null);

      await expect(
        service.getById('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'),
      ).rejects.toThrow('Identity record not found');

      expect(mockRepository.skBeginswith).toHaveBeenCalledTimes(1);
    });

    it('Should throw a BadRequest Error if the Identifier is not provided', async () => {
      vi.mocked(mockRepository.skBeginswith).mockResolvedValue(null);

      await expect(service.getById('')).rejects.toThrow(
        'A valid identifier must be provided',
      );

      expect(mockRepository.skBeginswith).toHaveBeenCalledTimes(0);
    });
  });

  describe('Delete Identity Record', () => {
    it('Should delete the Identity Record if it extists', async () => {
      vi.mocked(mockRepository.delete).mockResolvedValue(true);
      vi.mocked(mockRepository.skBeginswith).mockResolvedValue({
        pk: 'IDENTITY_RECORD#',
        sk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        serviceId: '',
        serviceName: '',
        udpId: '',
      });

      await service.deleteById('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d');

      expect(mockRepository.delete).toHaveBeenCalledWith({
        pk: 'IDENTITY_RECORD#',
        sk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      });
      expect(mockRepository.delete).toHaveBeenCalledTimes(1);
    });

    it('Should throw a NotFound Error if the Identity Record does not exist', async () => {
      vi.mocked(mockRepository.delete).mockRejectedValue(null);
      vi.mocked(mockRepository.skBeginswith).mockResolvedValue(null);

      await expect(
        service.deleteById('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d'),
      ).rejects.toThrow('Identity record not found');

      expect(mockRepository.delete).toHaveBeenCalledTimes(0);
    });

    it('Should throw a BadRequest Error if the Identifier is not provided', async () => {
      vi.mocked(mockRepository.get).mockResolvedValue(null);

      await expect(service.deleteById('')).rejects.toThrow(
        'A valid identifier must be provided',
      );

      expect(mockRepository.skBeginswith).toHaveBeenCalledTimes(0);
    });
  });

  describe('constructor', () => {
    it('should create service with DynamoDB repository', () => {
      const service = new DynamoDBIdentityService(mockRepository);
      expect(service).toBeInstanceOf(DynamoDBIdentityService);
    });
  });

  describe('Create App User', () => {
    it('Should create a new user when no user exists', async () => {
      const input: CreateUserInput = {
        appId: 'test-app-id',
      };

      vi.mocked(mockRepository.getByPk).mockResolvedValue(null);
      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      const result = await service.createAppUser(input);

      expect(mockRepository.getByPk).toHaveBeenCalledWith(`app#test-app-id`);
      expect(mockRepository.save).toHaveBeenCalledWith({
        pk: `app#test-app-id`,
        sk: `mock-string-uuid4`,
        udpId: 'mock-string-uuid4',
        serviceId: 'test-app-id',
        serviceName: 'app',
      });

      expect(result).toEqual({
        udpId: 'mock-string-uuid4',
        created: true,
      });
    });
  });
});
