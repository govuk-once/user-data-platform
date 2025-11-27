import { describe, expect, it, beforeEach } from 'vitest';
import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  PutItemCommandInput,
} from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { CompositeKeyEntity } from '../types/Entity';
import { DynamoDBRepository } from './DynamoDBRepository';
import { GetByIdError, SaveError } from '../errors/Errors';
import { logger } from '../utils/Logger';


const dynamoMock = mockClient(DynamoDBClient);

interface TestEntity extends CompositeKeyEntity {
  data?: Record<string, any>;
}

describe('DynamoDBRepository', () => {
  const tableName = 'test-table';
  let repository: DynamoDBRepository<TestEntity>;

  // Helper functions
  const getTtl = (secondsFromNow: number): number => 
    Math.floor(Date.now() / 1000) + secondsFromNow;

  const getSavedItem = (callIndex = 0) =>
    (dynamoMock.call(callIndex).args[0].input as PutItemCommandInput).Item;

  const expectErrorWithCause = <T extends Error>(
    error: unknown,
    errorType: new (...args: any[]) => T,
    expectedMessage?: string
  ) => {
    expect(error).toBeInstanceOf(errorType);
    const typedError = error as T & { cause: Error };
    expect(typedError.cause).toBeDefined();
    expect(typedError.cause).toBeInstanceOf(Error);
    if (expectedMessage) {
      expect(typedError.cause.message).toBe(expectedMessage);
    }
  };

  beforeEach(() => {
    dynamoMock.reset();
    logger.setEnabled(false);
    repository = new DynamoDBRepository<TestEntity>(
      tableName,
      dynamoMock as unknown as DynamoDBClient
    );
  });

  describe('get', () => {
    it('should return entity when item exists', async () => {
      const mockItem = {
        pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
        sk: { S: 'topics' },
        data: {
          M: {
            name: { S: 'John Doe' },
            email: { S: 'john@example.com' },
          },
        },
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' });

      expect(result).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      });
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: tableName,
        Key: {
          pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
          sk: { S: 'topics' },
        },
      });
    });

    it('should return null when item does not exist', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined,
      });

      const result = await repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' });

      expect(result).toBeNull();
    });

    it('should handle entity with complex nested data', async () => {
      const mockItem = {
        pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
        sk: { S: 'topics' },
        data: {
          M: {
            settings: {
              M: {
                theme: { S: 'dark' },
                notifications: { BOOL: true },
              },
            },
            tags: {
              L: [{ S: 'admin' }, { S: 'verified' }],
            },
          },
        },
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' });

      expect(result).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          settings: {
            theme: 'dark',
            notifications: true,
          },
          tags: ['admin', 'verified'],
        },
      });
    });

    it('should handle entity without data property', async () => {
      const mockItem = {
        pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
        sk: { S: 'topics' },
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' });

      expect(result).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });
    });

    it('should throw GetByIdError when DynamoDB operation fails', async () => {
      const mockError = new Error('DynamoDB error');
      dynamoMock.on(GetItemCommand).rejects(mockError);

      await expect(repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' })).rejects.toThrow(
        GetByIdError
      );
      await expect(repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' })).rejects.toThrow(
        'Failed to get item with id a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d#topics: DynamoDB error'
      );
    });

    it('should throw GetByIdError when pk is missing', async () => {
      const getWithoutPk = () => repository.get({ sk: 'topics' } as Partial<TestEntity>);
      
      await expect(getWithoutPk()).rejects.toThrow(GetByIdError);
      await expect(getWithoutPk()).rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should throw GetByIdError when sk is missing', async () => {
      const getWithoutSk = () => repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' } as Partial<TestEntity>);
      
      await expect(getWithoutSk()).rejects.toThrow(GetByIdError);
      await expect(getWithoutSk()).rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should throw GetByIdError when pk is undefined', async () => {
      const getWithUndefinedPk = () => repository.get({ pk: undefined, sk: 'topics' } as Partial<TestEntity>);
      
      await expect(getWithUndefinedPk()).rejects.toThrow(GetByIdError);
      await expect(getWithUndefinedPk()).rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should throw GetByIdError when sk is undefined', async () => {
      const getWithUndefinedSk = () => repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: undefined } as Partial<TestEntity>);
      
      await expect(getWithUndefinedSk()).rejects.toThrow(GetByIdError);
      await expect(getWithUndefinedSk()).rejects.toThrow('Both pk and sk are required for composite key entities');
    });

    it('should include cause in GetByIdError when DynamoDB fails', async () => {
      const mockError = new Error('Network timeout');
      dynamoMock.on(GetItemCommand).rejects(mockError);

      try {
        await repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' });
        expect.fail('Should have thrown GetByIdError');
      } catch (error) {
        expectErrorWithCause(error, GetByIdError, 'Network timeout');
      }
    });

    it('should include cause in GetByIdError when keys are invalid', async () => {
      try {
        await repository.get({ sk: 'topics' } as Partial<TestEntity>);
        expect.fail('Should have thrown GetByIdError');
      } catch (error) {
        expectErrorWithCause(error, GetByIdError);
      }
    });
  });

  describe('save', () => {
    it('should save entity successfully', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity);

      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: tableName,
        Item: {
          pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
          sk: { S: 'topics' },
          data: {
            M: {
              name: { S: 'John Doe' },
              email: { S: 'john@example.com' },
            },
          },
        },
      });
    });

    it('should save entity with only pk and sk', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity);

      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: tableName,
        Item: {
          pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
          sk: { S: 'topics' },
        },
      });
    });

    it('should save entity with complex nested data', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          settings: {
            theme: 'dark',
            notifications: true,
          },
          members: [
            { id: '1', role: 'admin' },
            { id: '2', role: 'user' },
          ],
        },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity);

      expect(
        (dynamoMock.call(0).args[0].input as PutItemCommandInput).Item
      ).toEqual({
        pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
        sk: { S: 'topics' },
        data: {
          M: {
            settings: {
              M: {
                theme: { S: 'dark' },
                notifications: { BOOL: true },
              },
            },
            members: {
              L: [
                {
                  M: {
                    id: { S: '1' },
                    role: { S: 'admin' },
                  },
                },
                {
                  M: {
                    id: { S: '2' },
                    role: { S: 'user' },
                  },
                },
              ],
            },
          },
        },
      });
    });

    it('should remove undefined values from data', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: undefined,
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity);

      expect(
        (dynamoMock.call(0).args[0].input as PutItemCommandInput).Item
      ).toEqual({
        pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
        sk: { S: 'topics' },
      });
    });

    it('should throw SaveError when DynamoDB operation fails', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
        },
      };

      const mockError = new Error('DynamoDB error');
      dynamoMock.on(PutItemCommand).rejects(mockError);

      await expect(repository.save(entity)).rejects.toThrow(SaveError);
      await expect(repository.save(entity)).rejects.toThrow(
        'Failed to save item with id a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d#topics: DynamoDB error'
      );
    });

    it('should include cause in SaveError when DynamoDB fails', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: { name: 'John' },
      };

      const mockError = new Error('Write capacity exceeded');
      dynamoMock.on(PutItemCommand).rejects(mockError);

      try {
        await repository.save(entity);
        expect.fail('Should have thrown SaveError');
      } catch (error) {
        expectErrorWithCause(error, SaveError, 'Write capacity exceeded');
      }
    });

    it('should overwrite existing entity with same pk and sk', async () => {
      const entity1: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
          version: 1,
        },
      };

      const entity2: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Updated',
          version: 2,
        },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity1);
      await repository.save(entity2);

      expect(dynamoMock.calls()).toHaveLength(2);
    });
  });

  describe('constructor', () => {
    it('should create repository with provided DynamoDB client', () => {
      const customClient = new DynamoDBClient({});
      const repo = new DynamoDBRepository<TestEntity>(tableName, customClient);

      expect(repo).toBeInstanceOf(DynamoDBRepository);
    });
  });

  describe('TTL (Time To Live)', () => {
    it('should save entity with ttl field', async () => {
      const ttlValue = getTtl(3600);
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: ttlValue,
        data: { sessionId: 'abc123' },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity);

      const savedItem = getSavedItem();
      expect(savedItem).toHaveProperty('ttl');
      expect(savedItem?.ttl).toEqual({ N: ttlValue.toString() });
      expect(savedItem).toHaveProperty('pk');
      expect(savedItem).toHaveProperty('sk');
      expect(savedItem).toHaveProperty('data');
    });

    it('should retrieve entity with ttl field', async () => {
      const ttlValue = getTtl(3600);
      const mockItem = {
        pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
        sk: { S: 'topics' },
        ttl: { N: ttlValue.toString() },
        data: {
          M: {
            sessionId: { S: 'abc123' },
          },
        },
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' });

      expect(result).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: ttlValue,
        data: {
          sessionId: 'abc123',
        },
      });
      expect(result?.ttl).toBe(ttlValue);
    });

    it('should save entity without ttl field', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: { userId: 'user456' },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity);

      const savedItem = getSavedItem();
      expect(savedItem).not.toHaveProperty('ttl');
      expect(savedItem).toHaveProperty('pk');
      expect(savedItem).toHaveProperty('sk');
    });

    it('should retrieve entity without ttl field', async () => {
      const mockItem = {
        pk: { S: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d' },
        sk: { S: 'topics' },
        data: {
          M: {
            userId: { S: 'user789' },
          },
        },
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({ pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d', sk: 'topics' });

      expect(result).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          userId: 'user789',
        },
      });
      expect(result).not.toHaveProperty('ttl');
    });

    it('should handle ttl value of 0', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: 0,
        data: { status: 'expired' },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity);

      const savedItem = getSavedItem();
      expect(savedItem).toHaveProperty('ttl');
      expect(savedItem?.ttl).toEqual({ N: '0' });
    });

    it('should update ttl when overwriting entity', async () => {
      const ttl1 = getTtl(3600);
      const ttl2 = getTtl(7200);

      const entity1: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: ttl1,
        data: { version: 1 },
      };

      const entity2: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: ttl2,
        data: { version: 2 },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity1);
      await repository.save(entity2);

      const firstSave = getSavedItem(0);
      const secondSave = getSavedItem(1);

      expect(firstSave?.ttl).toEqual({ N: ttl1.toString() });
      expect(secondSave?.ttl).toEqual({ N: ttl2.toString() });
    });

    it('should remove ttl when overwriting entity with one without ttl', async () => {
      const ttl = getTtl(3600);

      const entity1: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: ttl,
        data: { withTtl: true },
      };

      const entity2: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: { withTtl: false },
      };

      dynamoMock.on(PutItemCommand).resolves({});

      await repository.save(entity1);
      await repository.save(entity2);

      const firstSave = getSavedItem(0);
      const secondSave = getSavedItem(1);

      expect(firstSave).toHaveProperty('ttl');
      expect(secondSave).not.toHaveProperty('ttl');
    });
  });
});
