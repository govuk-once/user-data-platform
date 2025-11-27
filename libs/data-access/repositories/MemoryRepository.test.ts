import { describe, expect, it, beforeEach } from 'vitest';
import { CompositeKeyEntity } from '../types/Entity';
import { MemoryRepository } from './MemoryRepository';
import { GetByIdError } from '../errors/Errors';
import { logger } from '../utils/Logger';

describe('MemoryRepository', () => {
  beforeEach(() => {
    // Disable logging to keep test output clean
    logger.setEnabled(false);
  });
  describe('get', () => {
    it('should return entity when pk and sk exist', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();
      const entity: CompositeKeyEntity = { pk: 'USER#123', sk: 'PROFILE' };
      await repository.save(entity);

      const result = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });

      expect(result).toEqual(entity);
    });

    it('should return null when pk and sk do not exist', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();

      const result = await repository.get({ pk: 'USER#999', sk: 'PROFILE' });

      expect(result).toBeNull();
    });

    it('should return null for empty repository', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();

      const result = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });

      expect(result).toBeNull();
    });

    it('should throw GetByIdError when pk is missing', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();

      await expect(repository.get({ sk: 'PROFILE' } as Partial<CompositeKeyEntity>))
        .rejects.toThrow(GetByIdError);
      await expect(repository.get({ sk: 'PROFILE' } as Partial<CompositeKeyEntity>))
        .rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should throw GetByIdError when sk is missing', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();

      await expect(repository.get({ pk: 'USER#123' } as Partial<CompositeKeyEntity>))
        .rejects.toThrow(GetByIdError);
      await expect(repository.get({ pk: 'USER#123' } as Partial<CompositeKeyEntity>))
        .rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should throw GetByIdError when pk is undefined', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();

      await expect(repository.get({ pk: undefined, sk: 'PROFILE' } as Partial<CompositeKeyEntity>))
        .rejects.toThrow(GetByIdError);
      await expect(repository.get({ pk: undefined, sk: 'PROFILE' } as Partial<CompositeKeyEntity>))
        .rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should throw GetByIdError when sk is undefined', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();

      await expect(repository.get({ pk: 'USER#123', sk: undefined } as Partial<CompositeKeyEntity>))
        .rejects.toThrow(GetByIdError);
      await expect(repository.get({ pk: 'USER#123', sk: undefined } as Partial<CompositeKeyEntity>))
        .rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should include cause in GetByIdError', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();

      try {
        await repository.get({ sk: 'PROFILE' } as Partial<CompositeKeyEntity>);
        expect.fail('Should have thrown GetByIdError');
      } catch (error) {
        expect(error).toBeInstanceOf(GetByIdError);
        expect((error as GetByIdError).cause).toBeDefined();
        expect((error as GetByIdError).cause).toBeInstanceOf(Error);
      }
    });
  });

  describe('save', () => {
    it('should save entity successfully', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();
      const entity: CompositeKeyEntity = { pk: 'USER#456', sk: 'METADATA' };

      await repository.save(entity);
      const result = await repository.get({ pk: 'USER#456', sk: 'METADATA' });

      expect(result).toEqual(entity);
    });

    it('should save entity with empty pk and sk', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();
      const entity: CompositeKeyEntity = { pk: '', sk: '' };

      await repository.save(entity);
      const result = await repository.get({ pk: '', sk: '' });

      expect(result).toEqual(entity);
    });

    it('should overwrite existing entity with same pk and sk', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();
      const entity1: CompositeKeyEntity = {
        pk: 'USER#123',
        sk: 'PROFILE',
        data: { version: 1 },
      };
      const entity2: CompositeKeyEntity = {
        pk: 'USER#123',
        sk: 'PROFILE',
        data: { version: 2 },
      };

      await repository.save(entity1);
      await repository.save(entity2);
      const result = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });

      expect(result).toEqual(entity2);
    });
  });

  describe('deep cloning', () => {
    it('should return a deep clone from get to prevent external mutations', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();
      const entity: CompositeKeyEntity = {
        pk: 'USER#123',
        sk: 'PROFILE',
        data: { name: 'John', settings: { theme: 'dark' } },
      };
      await repository.save(entity);

      const result = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });
      
      // Mutate the result
      if (result?.data) {
        result.data.name = 'Jane';
        result.data.settings = { theme: 'light' };
      }

      // Original should be unchanged
      const original = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });
      expect(original?.data?.name).toBe('John');
      expect(original?.data?.settings?.theme).toBe('dark');
    });

    it('should store a deep clone in save to prevent external mutations', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();
      const entity: CompositeKeyEntity = {
        pk: 'USER#123',
        sk: 'PROFILE',
        data: { count: 1 },
      };
      await repository.save(entity);

      // Mutate the original entity
      entity.data!.count = 999;

      // Stored entity should be unchanged
      const stored = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });
      expect(stored?.data?.count).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all entities', async () => {
      const repository = new MemoryRepository<CompositeKeyEntity>();
      await repository.save({ pk: 'USER#123', sk: 'PROFILE' });
      await repository.save({ pk: 'USER#456', sk: 'PROFILE' });

      repository.clear();

      const result1 = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });
      const result2 = await repository.get({ pk: 'USER#456', sk: 'PROFILE' });

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });
  });
});
