import { describe, expect, it, beforeEach } from 'vitest';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDbClient } from './DynamoDbClient';
import { DynamoDBEntity, DynamoDBAttributeMap } from '../types/Entity';
import { GetError, SaveError } from '../errors/Errors';
import { logger } from '../utils/Logger';

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('DynamoDbClient Integration Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    logger.setEnabled(false);
  });

  describe('Client Initialization', () => {
    it('should throw error when table name is missing', () => {
      expect(() => new DynamoDbClient<DynamoDBEntity>(undefined)).toThrow(
        'TABLE_NAME environment variable is required',
      );
    });

    it('should initialize successfully with table name', () => {
      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();
      expect(service).toBeDefined();
    });
  });

  describe('Get Operations - Full Stack', () => {
    it('should retrieve entity through full stack (Client → Service → Repository → AWS SDK)', async () => {
      const mockEntity = {
        pk: 'user-123',
        sk: 'topics',
        data: { status: 'active' },
      };

      dynamoMock.on(GetCommand).resolves({
        Item: mockEntity,
      });

      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();
      const result = await service.getByKey('user-123', 'topics');

      expect(result).toEqual(mockEntity);
      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: 'test-table',
        Key: { pk: 'user-123', sk: 'topics' },
      });
    });

    it('should return null when entity not found', async () => {
      dynamoMock.on(GetCommand).resolves({
        Item: undefined,
      });

      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();
      const result = await service.getByKey('user-456', 'topics');

      expect(result).toBeNull();
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should propagate GetError from repository through service', async () => {
      dynamoMock
        .on(GetCommand)
        .rejects(new Error('DynamoDB connection failed'));

      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();

      await expect(service.getByKey('user-123', 'topics')).rejects.toThrow(
        GetError,
      );
      expect(dynamoMock.calls()).toHaveLength(1);
    });

    it('should throw GetError for missing pk or sk', async () => {
      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();

      await expect(service.getByKey('', 'topics')).rejects.toThrow(GetError);
      await expect(service.getByKey('user-123', '')).rejects.toThrow(GetError);
      expect(dynamoMock.calls()).toHaveLength(0);
    });
  });

  describe('Save Operations - Full Stack', () => {
    it('should save entity through full stack (Client → Service → Repository → AWS SDK)', async () => {
      dynamoMock.on(PutCommand).resolves({});

      const entity: DynamoDBEntity = {
        pk: 'user-123',
        sk: 'topics',
        data: { status: 'active', tags: ['new', 'verified'] },
        ttl: Math.floor(Date.now() / 1000) + 3600,
      };

      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();
      await service.save(entity);

      expect(dynamoMock.calls()).toHaveLength(1);
      expect(dynamoMock.call(0).args[0].input).toEqual({
        TableName: 'test-table',
        Item: entity,
      });
    });

    it('should validate entity before saving', async () => {
      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();

      const invalidEntity = {
        pk: '',
        sk: 'topics',
        data: { status: 'active' },
      } as DynamoDBEntity;

      await expect(service.save(invalidEntity)).rejects.toThrow(SaveError);
      expect(dynamoMock.calls()).toHaveLength(0);
    });

    it('should reject negative TTL values', async () => {
      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();

      const entityWithNegativeTTL = {
        pk: 'user-123',
        sk: 'topics',
        data: { status: 'active' },
        ttl: -100,
      } as DynamoDBEntity;

      await expect(service.save(entityWithNegativeTTL)).rejects.toThrow(
        SaveError,
      );
      expect(dynamoMock.calls()).toHaveLength(0);
    });

    it('should propagate SaveError from repository through service', async () => {
      dynamoMock.on(PutCommand).rejects(new Error('DynamoDB write failed'));

      const entity: DynamoDBEntity = {
        pk: 'user-123',
        sk: 'topics',
        data: { status: 'active' },
      };

      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();

      await expect(service.save(entity)).rejects.toThrow(SaveError);
      expect(dynamoMock.calls()).toHaveLength(1);
    });
  });

  describe('Type Safety - Full Stack', () => {
    it('should maintain type safety through all layers', async () => {
      interface CustomData extends DynamoDBAttributeMap {
        status: 'active' | 'inactive';
        count: number;
        tags: string[];
      }

      interface CustomEntity extends DynamoDBEntity<CustomData> {
        pk: string;
        sk: string;
      }

      const mockEntity: CustomEntity = {
        pk: 'item-123',
        sk: 'metadata',
        data: {
          status: 'active',
          count: 42,
          tags: ['test', 'verified'],
        },
      };

      dynamoMock.on(GetCommand).resolves({
        Item: mockEntity,
      });

      const client = new DynamoDbClient<CustomEntity>('test-table');
      const service = client.getService();
      const result = await service.getByKey('item-123', 'metadata');

      expect(result).toEqual(mockEntity);
      expect(result?.data?.status).toBe('active');
      expect(result?.data?.count).toBe(42);
      expect(result?.data?.tags).toEqual(['test', 'verified']);
    });
  });

  describe('Error Propagation - Full Stack', () => {
    it('should propagate error details through all layers', async () => {
      const awsError = new Error('ConditionalCheckFailedException');
      dynamoMock.on(GetCommand).rejects(awsError);

      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();

      try {
        await service.getByKey('user-123', 'topics');
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error).toBeInstanceOf(GetError);
        expect((error as GetError).cause).toBe(awsError);
        expect((error as GetError).message).toContain(
          'ConditionalCheckFailedException',
        );
      }
    });
  });

  describe('Multiple Operations - Full Stack', () => {
    it('should handle sequential get and save operations', async () => {
      const existingEntity: DynamoDBEntity = {
        pk: 'user-123',
        sk: 'topics',
        data: { status: 'active' },
      };

      const updatedEntity: DynamoDBEntity = {
        pk: 'user-123',
        sk: 'topics',
        data: { status: 'inactive' },
      };

      dynamoMock.on(GetCommand).resolves({ Item: existingEntity });
      dynamoMock.on(PutCommand).resolves({});

      const client = new DynamoDbClient<DynamoDBEntity>('test-table');
      const service = client.getService();

      // Get existing entity
      const result = await service.getByKey('user-123', 'topics');
      expect(result).toEqual(existingEntity);

      // Update entity
      await service.save(updatedEntity);

      expect(dynamoMock.calls()).toHaveLength(2);
    });
  });
});
