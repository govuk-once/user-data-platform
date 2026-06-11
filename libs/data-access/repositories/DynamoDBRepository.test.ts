/* eslint-disable @typescript-eslint/no-explicit-any */
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBEntity } from '../types/Entity';
import { DynamoDBRepository } from './DynamoDBRepository';
import { EncryptionService } from '../services/EncryptionService';
import { Logger, InvalidDynamoKeyError, UDP_ERROR_TYPES } from '@libs/utils';
import { LogLevel } from '@aws-lambda-powertools/logger';

const logger = new Logger(
  { serviceName: 'DynamoTest', environment: 'testing' },
  { redact: ['__dataKey', 'data'] },
);

logger.setLogLevel(LogLevel.SILENT);

const dynamoMock = mockClient(DynamoDBDocumentClient);

interface TestEntity extends DynamoDBEntity {
  data?: Record<string, any>;
  __dataKey?: string;
}

describe('DynamoDBRepository', () => {
  const tableName = 'test-table';
  let repository: DynamoDBRepository<TestEntity>;

  // Helper functions
  const getTtl = (secondsFromNow: number): number =>
    Math.floor(Date.now() / 1000) + secondsFromNow;

  const getSavedItem = (callIndex = 0) => {
    const input = dynamoMock.call(callIndex).args[0].input as { Item: any };
    return input.Item;
  };

  beforeEach(() => {
    dynamoMock.reset();
    repository = new DynamoDBRepository<TestEntity>(
      tableName,
      dynamoMock as unknown as DynamoDBDocumentClient,
      undefined,
      logger,
    );
  });

  describe('get', () => {
    it('should return entity when item exists', async () => {
      const mockItem = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      const loggerSpy = vi.spyOn(logger, 'debug');

      dynamoMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

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
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: 'topics',
        },
      });
      expect(loggerSpy).toHaveBeenCalled();
    });

    it('should return null when item does not exist', async () => {
      dynamoMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const result = await repository.get({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

      expect(result).toBeNull();
    });

    it('should handle entity with complex nested data', async () => {
      const mockItem = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          settings: {
            theme: 'dark',
            notifications: true,
          },
          tags: ['admin', 'verified'],
        },
      };

      dynamoMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

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
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      dynamoMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

      expect(result).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });
    });

    it('should throw the original error when DynamoDB operation fails', async () => {
      const mockError = new Error('DynamoDB error');
      dynamoMock.on(GetCommand).rejects(mockError);

      await expect(
        repository.get({
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: 'topics',
        }),
      ).rejects.toThrow(mockError);
    });

    it('should throw an InvalidDynamoKeyError when pk is missing', async () => {
      try {
        await repository.get({ sk: 'topics' } as Partial<TestEntity>);

        expect.fail('Error should have been thrown');
      } catch (error) {
        const expectedError = new InvalidDynamoKeyError(
          'Both pk and sk are required for composite key entities',
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
          undefined,
          'topics',
        );

        expect(error).instanceOf(InvalidDynamoKeyError);
        expect(error as InvalidDynamoKeyError).toEqual(expectedError);
      }
    });

    it('should throw an InvalidDynamoKeyError when sk is missing', async () => {
      try {
        await repository.get({
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        } as Partial<TestEntity>);

        expect.fail('Error should have been thrown');
      } catch (error) {
        const expectedError = new InvalidDynamoKeyError(
          'Both pk and sk are required for composite key entities',
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
          'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          undefined,
        );

        expect(error).instanceOf(InvalidDynamoKeyError);
        expect(error as InvalidDynamoKeyError).toEqual(expectedError);
      }
    });

    it('should throw an InvalidDynamoKeyError when pk is undefined', async () => {
      try {
        await repository.get({
          pk: undefined,
          sk: 'topics',
        } as Partial<TestEntity>);

        expect.fail('Error should have been thrown');
      } catch (error) {
        const expectedError = new InvalidDynamoKeyError(
          'Both pk and sk are required for composite key entities',
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
          undefined,
          'topics',
        );

        expect(error).instanceOf(InvalidDynamoKeyError);
        expect(error as InvalidDynamoKeyError).toEqual(expectedError);
      }
    });

    it('should throw an InvalidDynamoKeyError when sk is undefined', async () => {
      try {
        await repository.get({
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: undefined,
        } as Partial<TestEntity>);

        expect.fail('Error should have been thrown');
      } catch (error) {
        const expectedError = new InvalidDynamoKeyError(
          'Both pk and sk are required for composite key entities',
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
          'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          undefined,
        );

        expect(error).instanceOf(InvalidDynamoKeyError);
        expect(error as InvalidDynamoKeyError).toEqual(expectedError);
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

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity);

      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: tableName,
        Item: {
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: 'topics',
          data: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        },
      });
    });

    it('should save entity with only pk and sk', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity);

      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: tableName,
        Item: {
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: 'topics',
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

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity);

      expect((dynamoMock.call(0).args[0].input as any).Item).toEqual({
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
      });
    });

    it('should save entity with undefined data property', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: undefined,
      };

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity);

      expect((dynamoMock.call(0).args[0].input as any).Item).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: undefined,
      });
    });

    it('should throw the original error when DynamoDB operation fails', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
        },
      };

      const mockError = new Error('DynamoDB error');
      dynamoMock.on(PutCommand).rejects(mockError);

      await expect(repository.save(entity)).rejects.toThrow(mockError);
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

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity1);
      await repository.save(entity2);

      expect(dynamoMock.calls()).toHaveLength(2);
    });
  });

  describe('delete', () => {
    it('should delete the entity successfully', async () => {
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      dynamoMock.on(DeleteCommand).resolves({});

      await repository.delete(entity);

      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: tableName,
        Key: {
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: 'topics',
        },
        ConditionExpression: 'attribute_exists(pk)',
      });
    });

    it('should return null when a conditional check exception is thrown by the DynamoClient', async () => {
      const mockError = new Error('Network timeout');
      mockError.name = 'ConditionalCheckFailedException';
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      dynamoMock.on(DeleteCommand).rejects(mockError);
      const response = await repository.delete(entity);

      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toBeNull();
    });

    it('should throw original error when entity fails to delete', async () => {
      const mockError = new Error('Network timeout');
      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      };

      dynamoMock.on(DeleteCommand).rejects(mockError);
      await expect(repository.delete(entity)).rejects.toThrow(mockError);
    });
  });

  describe('getByPk', () => {
    it('should throw the original error if the DynamoDB operation fails', async () => {
      const pk = 'pk';
      const mockError = new Error('This call has failed');

      dynamoMock.on(QueryCommand).rejects(mockError);

      await expect(repository.getByPk(pk)).rejects.toThrow(mockError);
    });

    it('should return null if the DynamoDB response is undefined', async () => {
      const pk = 'pk';
      const mockResponse = { Items: undefined };

      dynamoMock.on(QueryCommand).resolves(mockResponse);

      const response = await repository.getByPk(pk);
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toBeNull();
    });

    it('should return null if the DynamoDB response is an empty list', async () => {
      const pk = 'pk';
      const mockResponse = { Items: [] };

      dynamoMock.on(QueryCommand).resolves(mockResponse);

      const response = await repository.getByPk(pk);
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toBeNull();
    });

    it('should return the item if the DynamoDB response is valid', async () => {
      const pk = 'pk';
      const mockResponse = { Items: [{ pk: 'pk', sk: 'sk', test: '123' }] };

      dynamoMock.on(QueryCommand).resolves(mockResponse);

      const response = await repository.getByPk(pk);
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toEqual({ ...mockResponse.Items[0] });
    });
  });

  describe('skBeginsWith', () => {
    /*
      throws error if db error
      returns null if response undefined
      returns null if items list empty
      returns items
    */
    it('should throw the original error if the DynamoDB operation fails', async () => {
      const pk = 'pk';
      const sk = 'sk';
      const mockError = new Error('This call has failed');

      dynamoMock.on(QueryCommand).rejects(mockError);

      await expect(repository.skBeginswith({ pk, sk })).rejects.toThrow(
        mockError,
      );
    });

    it('should return null if the DynamoDB response is undefined', async () => {
      const pk = 'pk';
      const sk = 'sk';
      const mockResponse = { Items: undefined };

      dynamoMock.on(QueryCommand).resolves(mockResponse);

      const response = await repository.skBeginswith({ pk, sk });
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toBeNull();
    });

    it('should return null if the DynamoDB response is an empty list', async () => {
      const pk = 'pk';
      const sk = 'sk';
      const mockResponse = { Items: [] };

      dynamoMock.on(QueryCommand).resolves(mockResponse);

      const response = await repository.skBeginswith({ pk, sk });
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toBeNull();
    });

    it('should return null if the DynamoDB list response holds undefined', async () => {
      const pk = 'pk';
      const sk = 'sk';
      const mockResponse = { Items: [undefined] };

      dynamoMock.on(QueryCommand).resolves(mockResponse);

      const response = await repository.skBeginswith({ pk, sk });
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toBeNull();
    });

    it('should return the item if the DynamoDB response is valid', async () => {
      const pk = 'pk';
      const sk = 'sk';
      const mockResponse = { Items: [{ pk: 'pk', sk: 'sk#123', test: '123' }] };

      dynamoMock.on(QueryCommand).resolves(mockResponse);

      const response = await repository.skBeginswith({ pk, sk });
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(response).toEqual({ ...mockResponse.Items[0] });
    });
  });

  describe('constructor', () => {
    it('should create repository with provided DynamoDB Document Client', () => {
      const repo = new DynamoDBRepository<TestEntity>(
        tableName,
        dynamoMock as unknown as DynamoDBDocumentClient,
      );

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

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity);

      const savedItem = getSavedItem();
      expect(savedItem).toHaveProperty('ttl');
      expect(savedItem?.ttl).toEqual(ttlValue);
      expect(savedItem).toHaveProperty('pk');
      expect(savedItem).toHaveProperty('sk');
      expect(savedItem).toHaveProperty('data');
    });

    it('should retrieve entity with ttl field', async () => {
      const ttlValue = getTtl(3600);
      const mockItem = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        ttl: ttlValue,
        data: {
          sessionId: 'abc123',
        },
      };

      dynamoMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

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
        data: { identifier: 'user456' },
      };

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity);

      const savedItem = getSavedItem();
      expect(savedItem).not.toHaveProperty('ttl');
      expect(savedItem).toHaveProperty('pk');
      expect(savedItem).toHaveProperty('sk');
    });

    it('should retrieve entity without ttl field', async () => {
      const mockItem = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          identifier: 'user789',
        },
      };

      dynamoMock.on(GetCommand).resolves({
        Item: mockItem,
      });

      const result = await repository.get({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

      expect(result).toEqual({
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          identifier: 'user789',
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

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity);

      const savedItem = getSavedItem();
      expect(savedItem).toHaveProperty('ttl');
      expect(savedItem?.ttl).toEqual(0);
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

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity1);
      await repository.save(entity2);

      const firstSave = getSavedItem(0);
      const secondSave = getSavedItem(1);

      expect(firstSave?.ttl).toEqual(ttl1);
      expect(secondSave?.ttl).toEqual(ttl2);
    });

    it('should handle removing ttl when overwriting entity', async () => {
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

      dynamoMock.on(PutCommand).resolves({});

      await repository.save(entity1);
      await repository.save(entity2);

      const firstSave = getSavedItem(0);
      const secondSave = getSavedItem(1);

      expect(firstSave).toHaveProperty('ttl');
      expect(secondSave).not.toHaveProperty('ttl');
    });
  });

  describe('encryption', () => {
    it('should encript the the field if encription config is passed', async () => {
      dynamoMock.reset();

      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      };

      dynamoMock.on(PutCommand).resolves({});

      const mockEncryptionService = {
        decryptFields: vi.fn(),
        encryptFields: vi.fn(),
      } as unknown as EncryptionService;

      (
        mockEncryptionService.encryptFields as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        data: 'encrypted-value',
        __dataKey: 'encrypted-key',
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

      const repo = new DynamoDBRepository<TestEntity>(
        tableName,
        dynamoMock as unknown as DynamoDBDocumentClient,
        {
          service: mockEncryptionService,
          dataFields: ['data'],
        },
      );

      await repo.save(entity);

      expect(mockEncryptionService.encryptFields).toHaveBeenCalledWith(entity, [
        'data',
      ]);

      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: tableName,
        Item: {
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: 'topics',
          data: 'encrypted-value',
          __dataKey: 'encrypted-key',
        },
      });
    });

    it('should decrypt the the field if encription config is passed', async () => {
      dynamoMock.reset();

      const entity: TestEntity = {
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
        data: 'encrypted-value' as unknown as Record<string, unknown>,
        __dataKey: 'encrypted-key',
      };

      dynamoMock.on(GetCommand).resolves({ Item: entity });

      const mockEncryptionService = {
        decryptFields: vi.fn(),
        encryptFields: vi.fn(),
      } as unknown as EncryptionService;

      (
        mockEncryptionService.decryptFields as ReturnType<typeof vi.fn>
      ).mockResolvedValueOnce({
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });

      const repo = new DynamoDBRepository<TestEntity>(
        tableName,
        dynamoMock as unknown as DynamoDBDocumentClient,
        {
          service: mockEncryptionService,
          dataFields: ['data'],
        },
      );

      const response = await repo.get(entity);

      expect(mockEncryptionService.decryptFields).toHaveBeenCalledWith(entity, [
        'data',
      ]);

      expect(response).toEqual({
        data: {
          name: 'John Doe',
          email: 'john@example.com',
        },
        pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        sk: 'topics',
      });
    });
  });
});
