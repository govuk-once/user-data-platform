import { describe, it, vi, beforeEach, expect } from 'vitest';
import {
  CreateUserInput,
  IdentityInput,
  IdentityRecordEntity,
} from '../types/Entity';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { DynamoDBIdentityService } from './DynamoDbIdentityService';

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

  describe('Create Identity Record', () => {
    it('Should successfully save a valid Identity Record for initial app registration', async () => {
      const input: IdentityInput = {
        serviceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        serviceName: 'app',
        appId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.create(input);

      expect(mockRepository.save).toHaveBeenCalledWith({
        pk: 'IDENTITY_RECORD#',
        sk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d/mock-string-uuid4',
        lsi_1: 'mock-string-uuid4/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        udpId: 'mock-string-uuid4',
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    // it('Should successfully save a valid Identity Record for other services', async () => {
    //   const input: IdentityInput = {
    //     serviceId: '2e3e32e3-23e3-23e2-23e23e23ee323',
    //     serviceName: 'department1',
    //     appId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    //     refreshToken: 'test_refresh',
    //     accessToken: 'test_access',
    //     idToken: 'test_id_token',
    //   };

    //   vi.mocked(mockRepository.skBeginswith).mockResolvedValue({
    //     pk: 'IDENTITY_RECORD#',
    //     sk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    //     udpId: 'mock-string-uuid4',
    //     serviceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    //     serviceName: 'app',
    //   });

    //   vi.mocked(mockRepository.save).mockResolvedValue(undefined);

    //   await service.create(input);

    //   expect(mockRepository.save).toHaveBeenCalledWith({
    //     pk: 'IDENTITY_RECORD#',
    //     sk: '2e3e32e3-23e3-23e2-23e23e23ee323/mock-string-uuid4',
    //     lsi_1: 'mock-string-uuid4/2e3e32e3-23e3-23e2-23e23e23ee323',
    //     udpId: 'mock-string-uuid4',
    //     refreshToken: 'test_refresh',
    //     accessToken: 'test_access',
    //     idToken: 'test_id_token',
    //     serviceName: 'department1',
    //     serviceId: '2e3e32e3-23e3-23e2-23e23e23ee323',
    //   });
    //   expect(mockRepository.save).toHaveBeenCalledTimes(1);
    // });

    it('should save entity with ttl', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const input: IdentityInput = {
        serviceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        appId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        serviceName: 'app',
        ttl,
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.create(input);

      expect(mockRepository.save).toHaveBeenCalledWith({
        pk: 'IDENTITY_RECORD#',
        sk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d/mock-string-uuid4',
        lsi_1: 'mock-string-uuid4/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        udpId: 'mock-string-uuid4',
        ttl,
      });
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should throw error when serviceId is missing', async () => {
      const entity: IdentityInput = {
        serviceId: '',
        appId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        serviceName: 'app',
      };

      await expect(service.create(entity)).rejects.toThrow(
        'Missing required field serviceId or appId',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
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
