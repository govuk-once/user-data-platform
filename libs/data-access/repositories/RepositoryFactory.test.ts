import { describe, expect, it, beforeEach } from 'vitest';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { CompositeKeyEntity } from '../types/Entity';
import { RepositoryFactory } from './RepositoryFactory';
import { DynamoDBRepository } from './DynamoDBRepository';
import { StoreType } from '../types/StoreType';
import { MemoryRepository } from './memoryRepository';
import { logger } from '../utils/Logger';

interface TestEntity extends CompositeKeyEntity {
  data?: Record<string, any>;
}

describe('RepositoryFactory', () => {
  beforeEach(() => {
    logger.setEnabled(false);
  });

  it('should create a MemoryRepository instance', () => {
    const repository = RepositoryFactory.create<TestEntity>(StoreType.MEMORY);

    expect(repository).toBeInstanceOf(MemoryRepository);
  });

  it('should create a working MemoryRepository', async () => {
    const repository = RepositoryFactory.create<TestEntity>(StoreType.MEMORY);
    const entity: TestEntity = {
      pk: 'USER#123',
      sk: 'PROFILE',
      data: { name: 'test' },
    };

    await repository.save(entity);
    const result = await repository.get({ pk: 'USER#123', sk: 'PROFILE' });

    expect(result).toEqual(entity);
  });

  it('should create a DynamoRepository instance', () => {
    const customClient = new DynamoDBClient({});
    const repository = RepositoryFactory.create<TestEntity>(
      StoreType.DYNAMODB,
      { tableName: 'test-table', client: customClient },
    );

    expect(repository).toBeInstanceOf(DynamoDBRepository);
  });

  it('should create a DynamoRepository with custom client', () => {
    const customClient = new DynamoDBClient({});
    const repository = RepositoryFactory.create<TestEntity>(
      StoreType.DYNAMODB,
      { tableName: 'test-table', client: customClient },
    );

    expect(repository).toBeInstanceOf(DynamoDBRepository);
  });

  it('should throw error when tableName is empty', () => {
    const createWithEmptyTableName = () =>
      RepositoryFactory.create<TestEntity>(StoreType.DYNAMODB, {
        tableName: '',
        client: new DynamoDBClient({}),
      });

    expect(createWithEmptyTableName).toThrow(
      'DynamoDB configuration with tableName and client is required for DYNAMODB store type',
    );
  });

  it('should throw error when client is not provided', () => {
    const createWithoutClient = () =>
      RepositoryFactory.create<TestEntity>(StoreType.DYNAMODB, {
        tableName: 'test-table',
      } as any);

    expect(createWithoutClient).toThrow(
      'DynamoDB configuration with tableName and client is required for DYNAMODB store type',
    );
  });
});
