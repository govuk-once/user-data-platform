import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DynamoDbService } from './DynamoDbService';
import { CompositeKeyEntity } from '../types/Entity';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { GetByIdError, SaveError } from '../errors/Errors';
import { logger } from '../utils/Logger';


interface TestEntity extends CompositeKeyEntity {
  data?: {
    status?: string;
    count?: number;
  };
}

describe('DynamoDbService', () => {
  let mockRepository: DynamoDBRepository<TestEntity>;
  let service: DynamoDbService<TestEntity>;

  beforeEach(() => {
    logger.setEnabled(false);
    mockRepository = {
      get: vi.fn(),
      save: vi.fn(),
    } as unknown as DynamoDBRepository<TestEntity>;
    service = new DynamoDbService(mockRepository);
  });

  describe('getByKey', () => {
    it('should return entity when it exists', async () => {
      const mockEntity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          status: 'active',
        },
      };

      vi.mocked(mockRepository.get).mockResolvedValue(mockEntity);

      const result = await service.getByKey(
        'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        'topics',
      );

      expect(result).toEqual(mockEntity);
      expect(mockRepository.get).toHaveBeenCalledWith({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });
      expect(mockRepository.get).toHaveBeenCalledTimes(1);
    });

    it('should return null when entity does not exist', async () => {
      vi.mocked(mockRepository.get).mockResolvedValue(null);

      const result = await service.getByKey(
        'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        'topics',
      );

      expect(result).toBeNull();
      expect(mockRepository.get).toHaveBeenCalledTimes(1);
    });

    it('should throw error when pk is missing', async () => {
      await expect(service.getByKey('', 'topics')).rejects.toThrow(GetByIdError);
      await expect(service.getByKey('', 'topics')).rejects.toThrow(
        'Both pk and sk are required',
      );
      expect(mockRepository.get).not.toHaveBeenCalled();
    });

    it('should throw error when sk is missing', async () => {
      await expect(
        service.getByKey('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', ''),
      ).rejects.toThrow(GetByIdError);
      await expect(
        service.getByKey('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', ''),
      ).rejects.toThrow('Both pk and sk are required');
      expect(mockRepository.get).not.toHaveBeenCalled();
    });

    it('should throw error when both pk and sk are missing', async () => {
      await expect(service.getByKey('', '')).rejects.toThrow(GetByIdError);
      await expect(service.getByKey('', '')).rejects.toThrow(
        'Both pk and sk are required',
      );
      expect(mockRepository.get).not.toHaveBeenCalled();
    });

    it('should handle entity with ttl', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const mockEntity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl,
        data: { status: 'active' },
      };

      vi.mocked(mockRepository.get).mockResolvedValue(mockEntity);

      const result = await service.getByKey(
        'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        'topics',
      );

      expect(result).toEqual(mockEntity);
      expect(result?.ttl).toBe(ttl);
    });

    it('should handle entity without data property', async () => {
      const mockEntity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      vi.mocked(mockRepository.get).mockResolvedValue(mockEntity);

      const result = await service.getByKey(
        'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        'topics',
      );

      expect(result).toEqual(mockEntity);
      expect(result).not.toHaveProperty('data');
    });
  });

  describe('save', () => {
    it('should save entity successfully', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          status: 'active',
        },
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.save(entity);

      expect(mockRepository.save).toHaveBeenCalledWith(entity);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should save entity with ttl', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl,
        data: { status: 'active' },
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.save(entity);

      expect(mockRepository.save).toHaveBeenCalledWith(entity);
      expect(mockRepository.save).toHaveBeenCalledTimes(1);
    });

    it('should save entity with only pk and sk', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.save(entity);

      expect(mockRepository.save).toHaveBeenCalledWith(entity);
    });

    it('should throw error when pk is missing', async () => {
      const entity = {
        sk: 'topics',
        data: { status: 'active' },
      } as TestEntity;

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'Entity must have both pk and sk',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when sk is missing', async () => {
      const entity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        data: { status: 'active' },
      } as TestEntity;

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'Entity must have both pk and sk',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when both pk and sk are missing', async () => {
      const entity = {
        data: { status: 'active' },
      } as TestEntity;

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'Entity must have both pk and sk',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when pk is empty string', async () => {
      const entity: TestEntity = {
        pk: '',
        sk: 'topics',
        data: { status: 'active' },
      };

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'Entity must have both pk and sk',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when sk is empty string', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: '',
        data: { status: 'active' },
      };

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'Entity must have both pk and sk',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when ttl is negative', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: -100,
        data: { status: 'active' },
      };

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'TTL must be a positive number',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should allow ttl of 0', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: 0,
        data: { status: 'active' },
      };

      vi.mocked(mockRepository.save).mockResolvedValue(undefined);

      await service.save(entity);

      expect(mockRepository.save).toHaveBeenCalledWith(entity);
    });

    it('should propagate repository errors', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: { status: 'active' },
      };

      const mockError = new Error('DynamoDB error');
      vi.mocked(mockRepository.save).mockRejectedValue(mockError);

      await expect(service.save(entity)).rejects.toThrow('DynamoDB error');
      expect(mockRepository.save).toHaveBeenCalledWith(entity);
    });
  });

  describe('constructor', () => {
    it('should create service with DynamoDB repository', () => {
      const service = new DynamoDbService(mockRepository);
      expect(service).toBeInstanceOf(DynamoDbService);
    });
  });
});
