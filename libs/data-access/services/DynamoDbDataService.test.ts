/* eslint-disable  @typescript-eslint/no-explicit-any */

import { DynamoDbDataService } from './DynamoDbDataService';
import { ServiceFactory } from '../factory/ServiceFactory';
import {
  DataInput,
  DynamoDBDataEntity,
  IdentityRecordEntity,
} from '../types/Entity';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { DataRecordNotFoundError, UDP_ERROR_TYPES } from '@libs/utils';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const kmsMock = mockClient(KMSClient);

const getCommandCall = (command: any, callNumber: number) => {
  return dynamoMock.commandCalls(command)[callNumber - 1].args[0].input;
};

describe('DynamoDb Data Service', () => {
  const tableName = 'test-data-service';
  const identityTableName = 'test-identity-service';
  const service: DynamoDbDataService = new ServiceFactory({
    tableName,
    identityTableName,
  }).getService('data');

  const mockResource = 'topics';
  const mockIdentity: IdentityRecordEntity = {
    pk: 'IDENTITY_RECORD#',
    sk: 'mock-service-id/a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    serviceId: 'mock-service-id',
    serviceName: 'app',
    udpId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  };

  beforeEach(() => {
    dynamoMock.reset();
  });

  describe('Save', () => {
    it('should successfully save a valid entity', async () => {
      const input: DataInput = {
        data: { test: 'value' },
      };

      dynamoMock.on(PutCommand).resolves({});

      const response = await service.save(mockIdentity, mockResource, input);

      expect(getCommandCall(PutCommand, 1)).toMatchObject({
        TableName: tableName,
        Item: {
          pk: mockIdentity.udpId,
          sk: mockResource,
          data: input.data,
        },
      });
      expect(response).toMatchObject({
        pk: mockIdentity.udpId,
        sk: mockResource,
        data: input.data,
      });
    });

    it('should successfully save an empty data entity', async () => {
      const input: DataInput = {
        configuration: {},
        data: {},
      };

      dynamoMock.on(PutCommand).resolves({});

      const response = await service.save(mockIdentity, mockResource, input);

      expect(getCommandCall(PutCommand, 1)).toMatchObject({
        TableName: tableName,
        Item: {
          pk: mockIdentity.udpId,
          sk: mockResource,
        },
      });
      expect(response).toMatchObject({
        pk: mockIdentity.udpId,
        sk: mockResource,
        data: input.data,
      });
    });

    it('should save entity with ttl', async () => {
      const ttl = Math.floor(Date.now() / 1000) + 3600;
      const input: DataInput = {
        data: { test: 'value' },
        configuration: { expiresAt: ttl },
      };

      dynamoMock.on(PutCommand).resolves({});

      const response = await service.save(mockIdentity, mockResource, input);

      expect(getCommandCall(PutCommand, 1)).toMatchObject({
        TableName: tableName,
        Item: {
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: mockResource,
          data: { test: 'value' },
          ttl,
        },
      });
      expect(response).toMatchObject({
        pk: mockIdentity.udpId,
        sk: mockResource,
        data: input.data,
        ttl: ttl,
      });
    });

    it('should throw the original error should the repository.save() call fail', async () => {
      const input: DataInput = {
        data: { test: 'value' },
      };
      const mockError = new Error('The repository.save() call failed');

      dynamoMock.on(PutCommand).rejects(mockError);

      await expect(
        service.save(mockIdentity, mockResource, input),
      ).rejects.toThrow(mockError);
    });
  });

  describe('Get by keys', () => {
    it('should successfully fetch a valid entity', async () => {
      const expiryDate = Math.floor(new Date('01/01/2030').getTime() / 1000);
      const result: DynamoDBDataEntity = {
        pk: 'mock-pk',
        sk: 'mock-sk',
        data: { test: 'value' },
        ttl: expiryDate,
      };

      dynamoMock.on(GetCommand).resolves({ Item: result });

      const response = await service.getByKey(mockIdentity, mockResource);

      expect(getCommandCall(GetCommand, 1)).toMatchObject({
        TableName: tableName,
        Key: {
          pk: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          sk: mockResource,
        },
      });
      expect(response).toEqual(result);
    });

    it('should throw a DataRecordNotFoundError when the fetched entity is undefined', async () => {
      dynamoMock.on(GetCommand).resolves({});

      try {
        await service.getByKey(mockIdentity, mockResource);
        expect.fail('Error should have been thrown');
      } catch (error) {
        const expectedError = new DataRecordNotFoundError(
          `Resource not found on path ${mockResource}: for identity ${mockIdentity.serviceName}#${mockIdentity.serviceId}`,
          UDP_ERROR_TYPES.DATA_NOT_FOUND,
          mockIdentity.serviceName,
          mockIdentity.serviceId,
          mockResource,
        );
        expect(error).instanceOf(DataRecordNotFoundError);
        expect(error).toEqual(expectedError);
      }
    });

    it('should throw the original error when respoitory.get() errors', async () => {
      const mockError = new Error('The repository.get() call failed');

      dynamoMock.on(GetCommand).rejects(mockError);

      await expect(
        service.getByKey(mockIdentity, mockResource),
      ).rejects.toThrow(mockError);
    });
  });

  describe('Delete by Key', () => {
    it('should successfully delete a valid entity', async () => {
      dynamoMock.on(DeleteCommand).resolves({});

      const response = await service.deleteByKey(mockIdentity, mockResource);
      expect(response).toBeTruthy();
      expect(getCommandCall(DeleteCommand, 1)).toMatchObject(
        expect.objectContaining({
          TableName: tableName,
          Key: {
            pk: mockIdentity.udpId,
            sk: mockResource,
          },
        }),
      );
    });

    it('should throw a DataRecordNotFoundError where the delete could not find the provided keys', async () => {
      const mockError = new Error('Failure');
      mockError.name = 'ConditionalCheckFailedException';
      dynamoMock.on(DeleteCommand).rejects(mockError);

      try {
        await service.deleteByKey(mockIdentity, mockResource);
      } catch (error) {
        const expectedError = new DataRecordNotFoundError(
          `Resource not found on path ${mockResource}: for identity ${mockIdentity.serviceName}#${mockIdentity.serviceId}`,
          UDP_ERROR_TYPES.DATA_NOT_FOUND,
          mockIdentity.serviceName,
          mockIdentity.serviceId,
          mockResource,
        );
        expect(error).instanceOf(DataRecordNotFoundError);
        expect(error).toEqual(expectedError);
      }
    });

    it('should throw the original error if the repository.delete() call errors', async () => {
      const mockError = new Error('Failure');
      dynamoMock.on(DeleteCommand).rejects(mockError);

      await expect(
        service.deleteByKey(mockIdentity, mockResource),
      ).rejects.toThrow(mockError);
    });
  });

  describe('Patch by Key', () => {
    it('deep-merges into the existing record and updates it', async () => {
      dynamoMock.on(GetCommand).resolves({
        Item: {
          pk: mockIdentity.udpId,
          sk: mockResource,
          data: { a: 1, nested: { x: 1 } },
        },
      });
      const merged = { a: 1, b: 2, nested: { x: 1, y: 2 } };
      dynamoMock.on(UpdateCommand).resolves({
        Attributes: { pk: mockIdentity.udpId, sk: mockResource, data: merged },
      });

      const result = await service.patchByKey(mockIdentity, mockResource, {
        b: 2,
        nested: { y: 2 },
      });

      expect(getCommandCall(UpdateCommand, 1)).toMatchObject({
        TableName: tableName,
        Key: { pk: mockIdentity.udpId, sk: mockResource },
        UpdateExpression: 'SET #data = :data',
        ExpressionAttributeNames: { '#data': 'data' },
        ExpressionAttributeValues: { ':data': merged },
        ConditionExpression: 'attribute_exists(pk)',
        ReturnValues: 'ALL_NEW',
      });
      expect(result).toMatchObject({ data: merged });
    });

    it('throws a DataRecordNotFoundError when the record does not exist', async () => {
      dynamoMock.on(GetCommand).resolves({});

      await expect(
        service.patchByKey(mockIdentity, mockResource, { b: 2 }),
      ).rejects.toBeInstanceOf(DataRecordNotFoundError);
      expect(dynamoMock.commandCalls(UpdateCommand).length).toBe(0);
    });
  });

  describe('Count by UDP ID', () => {
    it('sums the counts across all pages', async () => {
      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({ Count: 2, LastEvaluatedKey: { pk: '1', sk: '1' } })
        .resolvesOnce({ Count: 3 });

      const total = await service.countByUdpID(mockIdentity.udpId);

      expect(total).toBe(5);
      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': mockIdentity.udpId },
        Select: 'COUNT',
      });
      expect(dynamoMock.commandCalls(QueryCommand).length).toBe(2);
    });
  });

  describe('Get Key Page by UDP ID', () => {
    it('returns only pk/sk projections and the pagination key', async () => {
      const lastEvaluatedKey = { pk: mockIdentity.udpId, sk: 'topics' };
      dynamoMock.on(QueryCommand).resolves({
        Items: [{ pk: mockIdentity.udpId, sk: 'topics', data: { a: 1 } }],
        LastEvaluatedKey: lastEvaluatedKey,
      });

      const result = await service.getKeyPageByUdpID(mockIdentity.udpId);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: tableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': mockIdentity.udpId },
        Limit: 100,
        ProjectionExpression: 'pk, sk',
      });
      expect(result.items).toEqual([{ pk: mockIdentity.udpId, sk: 'topics' }]);
      expect(result.lastEvaluatedKey).toEqual(lastEvaluatedKey);
    });

    it('forwards an exclusive start key when paginating', async () => {
      const startKey = { pk: mockIdentity.udpId, sk: 'topics' };
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await service.getKeyPageByUdpID(mockIdentity.udpId, startKey);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        ExclusiveStartKey: startKey,
      });
    });
  });

  describe('Get All by UDP ID', () => {
    it('returns every record across all pages', async () => {
      const first = { pk: mockIdentity.udpId, sk: 'topics', data: { a: 1 } };
      const second = { pk: mockIdentity.udpId, sk: 'prefs', data: { b: 2 } };
      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({
          Items: [first],
          LastEvaluatedKey: { pk: '1', sk: '1' },
        })
        .resolvesOnce({ Items: [second] });

      const result = await service.getAllByUdpID(mockIdentity.udpId);

      expect(result).toEqual([first, second]);
      expect(dynamoMock.commandCalls(QueryCommand).length).toBe(2);
    });
  });

  describe('with encryption configured', () => {
    const key = Buffer.alloc(32, 'a');
    const encryptedKey = Buffer.from('encrypted-key-data');

    const encryptedService: DynamoDbDataService = new ServiceFactory({
      tableName,
      identityTableName,
      kmsKeyId: 'test-key-id',
    }).getService('data');

    beforeEach(() => {
      kmsMock.reset();
      kmsMock.on(GenerateDataKeyCommand).resolves({
        Plaintext: key,
        CiphertextBlob: encryptedKey,
      });
      kmsMock.on(DecryptCommand).resolves({ Plaintext: key });
    });

    it('encrypts the data field on save and decrypts it on read', async () => {
      const input: DataInput = { data: { secret: 'value' } };
      dynamoMock.on(PutCommand).resolves({});

      await encryptedService.save(mockIdentity, mockResource, input);

      const storedItem = getCommandCall(PutCommand, 1).Item;
      expect(storedItem.__dataKey).toBe(encryptedKey.toString('base64'));
      expect(storedItem.data).not.toEqual(input.data);

      dynamoMock.on(GetCommand).resolves({ Item: storedItem });

      const result = await encryptedService.getByKey(
        mockIdentity,
        mockResource,
      );

      expect(result.data).toEqual(input.data);
      expect('__dataKey' in result).toBe(false);
    });
  });
});
