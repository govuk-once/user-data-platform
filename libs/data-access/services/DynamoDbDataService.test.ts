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
} from '@aws-sdk/lib-dynamodb';
import { DataRecordNotFoundError, UDP_ERROR_TYPES } from '@libs/utils';

const dynamoMock = mockClient(DynamoDBDocumentClient);

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
});
