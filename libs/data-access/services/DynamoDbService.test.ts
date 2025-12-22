import { describe, expect, it, beforeEach, vi } from 'vitest';
import { DynamoDbService } from './DynamoDbService';
import { DynamoDBEntity } from '../types/Entity';
import { DynamoDBRepository } from '../repositories/DynamoDBRepository';
import { DeleteError, GetError, SaveError } from '../errors/Errors';
import { Logger } from '@libs/utils';
import { LogLevel } from '@aws-lambda-powertools/logger';

const logger = new Logger(
  { serviceName: 'DynamoTest', environment: 'testing' },
  { redact: ['__dataKey'] },
);

interface TestEntity extends DynamoDBEntity {
  data?: {
    status?: string;
    count?: number;
  };
}

describe('DynamoDbService', () => {
  let mockRepository: DynamoDBRepository<TestEntity>;
  let service: DynamoDbService<TestEntity>;

  beforeEach(() => {
    logger.setLogLevel(LogLevel.SILENT);
    mockRepository = {
      get: vi.fn(),
      save: vi.fn(),
      delete: vi.fn(),
    } as unknown as DynamoDBRepository<TestEntity>;
    service = new DynamoDbService(mockRepository, logger);
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

      const logSpy = vi.spyOn(logger, 'info');

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
      expect(logSpy).toHaveBeenCalled();
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
      const logSpy = vi.spyOn(logger, 'error');

      await expect(service.getByKey('', 'topics')).rejects.toThrow(GetError);
      await expect(service.getByKey('', 'topics')).rejects.toThrow(
        'Both pk and sk are required',
      );
      expect(mockRepository.get).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();
    });

    it('should throw error when sk is missing', async () => {
      await expect(
        service.getByKey('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', ''),
      ).rejects.toThrow(GetError);
      await expect(
        service.getByKey('a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', ''),
      ).rejects.toThrow('Both pk and sk are required');
      expect(mockRepository.get).not.toHaveBeenCalled();
    });

    it('should throw error when both pk and sk are missing', async () => {
      await expect(service.getByKey('', '')).rejects.toThrow(GetError);
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
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when ttl is a past timestamp', async () => {
      const pastTimestamp = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: pastTimestamp,
        data: { status: 'active' },
      };

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when ttl is current timestamp', async () => {
      const nowInSeconds = Math.floor(Date.now() / 1000);
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: nowInSeconds,
        data: { status: 'active' },
      };

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });

    it('should throw error when ttl is epoch (January 1, 1970)', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: 1,
        data: { status: 'active' },
      };

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      await expect(service.save(entity)).rejects.toThrow(
        'TTL must be a future timestamp in seconds since epoch',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
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

  describe('deleteByKey', () => {
    it('should delete entity when it exists', async () => {
      const mockEntity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      const logSpy = vi.spyOn(logger, 'info');

      vi.mocked(mockRepository.get).mockResolvedValue(mockEntity);

      await service.deleteByKey(
        'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        'topics',
      );

      expect(mockRepository.delete).toHaveBeenCalledWith({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });
      expect(mockRepository.delete).toHaveBeenCalledTimes(1);
      expect(logSpy).toHaveBeenCalled();
    });

    it('should throw error when pk is missing', async () => {
      await expect(service.deleteByKey('', 'topics')).rejects.toThrow(
        DeleteError,
      );
      await expect(service.deleteByKey('', 'topics')).rejects.toThrow(
        'Failed to delete entity with id undefined#topics: Both pk and sk are required',
      );
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw error when sk is missing', async () => {
      await expect(service.deleteByKey('entity', '')).rejects.toThrow(
        DeleteError,
      );
      await expect(service.deleteByKey('entity', '')).rejects.toThrow(
        'Failed to delete entity with id entity#undefined: Both pk and sk are required',
      );
      expect(mockRepository.delete).not.toHaveBeenCalled();
    });

    it('should throw error when both pk and sk are missing', async () => {
      await expect(service.deleteByKey('', '')).rejects.toThrow(DeleteError);
      await expect(service.deleteByKey('', '')).rejects.toThrow(
        'Failed to delete entity with id undefined#undefined: Both pk and sk are required',
      );
      expect(mockRepository.save).not.toHaveBeenCalled();
    });
  });
  describe('constructor', () => {
    it('should create service with DynamoDB repository', () => {
      const service = new DynamoDbService(mockRepository);
      expect(service).toBeInstanceOf(DynamoDbService);
    });
  });
});
