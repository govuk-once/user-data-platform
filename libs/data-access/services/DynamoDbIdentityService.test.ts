/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  CreateUserInput,
  IdentityInput,
  IdentityRecordEntity,
} from '../types/Entity';
import { DynamoDBIdentityService } from './DynamoDbIdentityService';
import { mockClient } from 'aws-sdk-client-mock';
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  PutCommand,
  QueryCommand,
} from '@aws-sdk/lib-dynamodb';
import { ServiceFactory } from '../factory/ServiceFactory';
import {
  BaseUDPError,
  IdentityLinkingInvalidIdentitesError,
  IdentityRecordNotFoundError,
  UDP_ERROR_TYPES,
} from '@libs/utils';

vi.mock('uuid', () => ({
  v4: vi.fn(() => 'mock-string-uuid4'),
}));

const dynamoMock = mockClient(DynamoDBDocumentClient);

const getCommandCall = (command: any, callNumber: number) => {
  return dynamoMock.commandCalls(command)[callNumber - 1].args[0].input;
};

describe('Identity Service', () => {
  const tableName = 'test-data-service';
  const identityTableName = 'test-identity-service';

  const mockAppIdentityRecord: IdentityRecordEntity = {
    pk: `app#test`,
    sk: 'mock-string-uuid4',
    serviceName: 'app',
    serviceId: 'test',
    udpId: 'mock-string-uuid4',
  };

  const service: DynamoDBIdentityService = new ServiceFactory({
    tableName,
    identityTableName,
  }).getService('identity');

  beforeEach(() => {
    dynamoMock.reset();
  });

  describe('Create App User', () => {
    it('should successfully add a new App user', async () => {
      const input: CreateUserInput = {
        appId: 'test',
      };
      const pk = `app#${input.appId}`;

      dynamoMock.on(QueryCommand).resolves({
        Items: [],
      });
      dynamoMock.on(PutCommand).resolves({});

      const result = await service.createAppUser(input);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1,
      });
      expect(getCommandCall(PutCommand, 1)).toMatchObject({
        TableName: identityTableName,
        Item: {
          pk: pk,
          sk: mockAppIdentityRecord.sk,
        },
      });
      expect(result).toEqual({ created: true, udpId: 'mock-string-uuid4' });
    });

    it('should not create duplicate values', async () => {
      const input: CreateUserInput = {
        appId: 'test',
      };
      const pk = `app#${input.appId}`;

      dynamoMock.on(QueryCommand).resolves({
        Items: [mockAppIdentityRecord],
      });

      const result = await service.createAppUser(input);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1,
      });
      expect(dynamoMock.commandCalls(PutCommand).length).toEqual(0);
      expect(result).toEqual({ created: false, udpId: '' });
    });

    it('should throw the underlying error from a repository failure', async () => {
      const input: CreateUserInput = {
        appId: 'test',
      };
      const pk = `app#${input.appId}`;
      const mockError = new BaseUDPError(
        'error',
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
      );

      dynamoMock.on(QueryCommand).rejects(mockError);

      await expect(service.createAppUser(input)).rejects.toThrowError(
        mockError,
      );

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1,
      });
      expect(dynamoMock.commandCalls(PutCommand).length).toEqual(0);
    });
  });

  describe('Link Identity', () => {
    it('should link the identity if the user exists', async () => {
      const input: IdentityInput = {
        appId: 'test',
        serviceId: 'test-service-id',
        serviceName: 'test-service',
      };
      const pk = `app#${input.appId}`;

      dynamoMock.on(QueryCommand).resolves({
        Items: [mockAppIdentityRecord],
      });
      dynamoMock.on(PutCommand).resolves({});

      await service.linkIdentity(input);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1,
      });
    });

    it('should link the identity if the user exists with TTL', async () => {
      const ttl = Math.floor(new Date('01/01/2030').getTime() / 1000);
      const input: IdentityInput = {
        appId: 'test',
        serviceId: 'test-service-id',
        serviceName: 'test-service',
        expiresAt: ttl,
      };
      const pk = `app#${input.appId}`;

      dynamoMock.on(QueryCommand).resolves({
        Items: [{ ...mockAppIdentityRecord, ttl }],
      });
      dynamoMock.on(PutCommand).resolves({});

      await service.linkIdentity(input);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1,
      });
    });

    it('should throw the underlying error if the save rejects', async () => {
      const input: IdentityInput = {
        appId: 'test',
        serviceId: 'test-service-id',
        serviceName: 'test-service',
      };

      dynamoMock.on(QueryCommand).resolves({
        Items: [mockAppIdentityRecord],
      });
      const mockError = new Error('A big scary error');
      dynamoMock.on(PutCommand).rejects(mockError);

      await expect(service.linkIdentity(input)).rejects.toThrowError(mockError);
    });

    it('should return an error if the app user doesnt exist', async () => {
      const input: IdentityInput = {
        appId: 'test',
        serviceId: 'test-service-id',
        serviceName: 'test-service',
      };
      const appServiceName = 'app';

      dynamoMock.on(QueryCommand).resolves({
        Items: [],
      });

      try {
        await service.linkIdentity(input);
        expect.fail('The error should have been thrown');
      } catch (error) {
        const expectedError = new IdentityRecordNotFoundError(
          `Identity not found with service: ${appServiceName} and id: ${input.appId}`,
          UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
          appServiceName,
          input.appId,
        );

        expect(error).instanceOf(IdentityRecordNotFoundError);
        expect(error).toEqual(expectedError);
      }
    });

    it('should return an error if the app user id equals the service id', async () => {
      const input: IdentityInput = {
        appId: 'test',
        serviceId: 'test',
        serviceName: 'test-service',
      };

      try {
        await service.linkIdentity(input);
        expect.fail('The error should have been thrown');
      } catch (error) {
        const expectedError = new IdentityLinkingInvalidIdentitesError(
          'The provided AppId and ServiceId for linking should not be the same value',
          UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
          input.appId,
          input.serviceId,
        );

        expect(error).instanceOf(IdentityLinkingInvalidIdentitesError);
        expect(error).toEqual(expectedError);
      }
    });
  });

  describe('Get Identity Record', () => {
    it('Should return the Identity Record if it extists', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';
      const pk = serviceName.concat('#', serviceId);
      const user = { ...mockAppIdentityRecord, pk, serviceName, serviceId };

      dynamoMock.on(QueryCommand).resolves({ Items: [user] });

      const result = await service.getByServiceId(serviceName, serviceId);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1,
      });
      expect(result).toEqual(user);
    });
    
    it('Should throw a IdentityRecordNotFoundError if the Identity Record if it is expired', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';
      const pk = serviceName.concat('#', serviceId);
      const user = { ...mockAppIdentityRecord, pk, serviceName, serviceId, ttl:  Math.floor(Date.parse('2026-01-01') / 1000)};

      dynamoMock.on(QueryCommand).resolves({ Items: [user] });

      try {
        const result = await service.getByServiceId(serviceName, serviceId);
      } catch (error) {
        expect(getCommandCall(QueryCommand, 1)).toMatchObject({
          TableName: identityTableName,
          KeyConditionExpression: 'pk = :pk',
          ExpressionAttributeValues: {
            ':pk': pk,
          },
          Limit: 1,
        });

        const expectedError = new IdentityRecordNotFoundError(
          `Identity not found with service: ${serviceName} and id: ${serviceId}`,
          UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
          serviceName,
          serviceId,
        );
        expect(error).instanceOf(IdentityRecordNotFoundError);
        expect(error).toEqual(expectedError)
      }

    });

    it('Should throw a IdentityRecordNotFoundError if the Identity Record does not exist', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      try {
        await service.getByServiceId(serviceName, serviceId);
        expect.fail('An error should have been thrown');
      } catch (error) {
        const expectedError = new IdentityRecordNotFoundError(
          `Identity not found with service: ${serviceName} and id: ${serviceId}`,
          UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
          serviceName,
          serviceId,
        );
        expect(error).instanceOf(IdentityRecordNotFoundError);
        expect(error).toEqual(expectedError);
      }
    });

    it('Should throw the underlying error if the repository.getByPl() call fails', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';

      const mockError = new BaseUDPError(
        'Error',
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
      );
      dynamoMock.on(QueryCommand).rejects(mockError);

      await expect(
        service.getByServiceId(serviceName, serviceId),
      ).rejects.toThrowError(mockError);
    });
  });

  describe('Delete Identity Record', () => {
    it('Should delete the Identity Record if it extists', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';
      const pk = serviceName.concat('#', serviceId);
      const identity = { ...mockAppIdentityRecord, pk, serviceName, serviceId };

      dynamoMock.on(QueryCommand).resolves({ Items: [identity] });
      dynamoMock.on(DeleteCommand).resolves({});

      const result = await service.deleteById(serviceName, serviceId);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: {
          ':pk': pk,
        },
        Limit: 1,
      });
      expect(getCommandCall(DeleteCommand, 1)).toMatchObject({
        TableName: identityTableName,
        Key: { pk, sk: identity.sk },
        ConditionExpression: 'attribute_exists(pk)',
      });
      expect(result).toBeTruthy();
    });

    it('Should throw a IdentityRecordNotFoundError if the Identity Record does not exist', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';

      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      try {
        await service.deleteById(serviceName, serviceId);
        expect.fail('An error should have been thrown');
      } catch (error) {
        const expectedError = new IdentityRecordNotFoundError(
          `Identity not found with service: ${serviceName} and id: ${serviceId}`,
          UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
          serviceName,
          serviceId,
        );
        expect(error).instanceOf(IdentityRecordNotFoundError);
        expect(error).toEqual(expectedError);
      }
    });

    it('Should throw a IdentityRecordNotFoundError if the Delete Record does not return true', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';
      const pk = serviceName.concat('#', serviceId);
      const identity = { ...mockAppIdentityRecord, pk, serviceName, serviceId };

      const mockError = new Error('Entity does not exist');
      mockError.name = 'ConditionalCheckFailedException';

      dynamoMock.on(QueryCommand).resolves({ Items: [identity] });
      dynamoMock.on(DeleteCommand).rejects(mockError);

      try {
        await service.deleteById(serviceName, serviceId);
        expect.fail('An error should have been thrown');
      } catch (error) {
        const expectedError = new IdentityRecordNotFoundError(
          `Identity not found with service: ${serviceName} and id: ${serviceId}`,
          UDP_ERROR_TYPES.IDENTITY_NOT_FOUND,
          serviceName,
          serviceId,
        );
        expect(error).instanceOf(IdentityRecordNotFoundError);
        expect(error).toEqual(expectedError);
      }
    });

    it('Should throw the underlying error if the repository.getByPl() call fails', async () => {
      const serviceId = 'test';
      const serviceName = 'test-service';

      const mockError = new BaseUDPError(
        'Error',
        UDP_ERROR_TYPES.INTERNAL_SERVER_ERROR,
      );
      dynamoMock.on(QueryCommand).rejects(mockError);

      await expect(
        service.deleteById(serviceName, serviceId),
      ).rejects.toThrowError(mockError);
    });
  });

  describe('Delete All by UDP ID', () => {
    const udpId = 'mock-string-uuid4';

    it('should delete all linked identities and return the count', async () => {
      const identities = [
        {
          pk: 'app#test',
          sk: udpId,
          serviceName: 'app',
          serviceId: 'test',
          udpId,
        },
        {
          pk: 'dwp#twp-id',
          sk: udpId,
          serviceName: 'dwp',
          serviceId: 'dwp-id',
          udpId,
        },
      ];

      dynamoMock.on(QueryCommand).resolves({ Items: identities });
      dynamoMock.on(DeleteCommand).resolves({});

      const result = await service.deleteAllByUdpId(udpId);

      expect(result).toBe(2);
    });

    it('should return 0 when no identities are found', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      const result = await service.deleteAllByUdpId(udpId);

      expect(result).toBe(0);
    });

    it('Should throw on non-conditional errors', async () => {
      const identities = [
        {
          pk: 'app#test',
          sk: udpId,
          serviceName: 'app',
          serviceId: 'test',
          udpId,
        },
      ];

      dynamoMock.on(QueryCommand).resolves({ Items: identities });
      dynamoMock.on(DeleteCommand).rejects(new Error('Internal server error'));

      await expect(service.deleteAllByUdpId(udpId)).rejects.toThrow(
        'Internal server error',
      );
    });
  });

  describe('constructor', () => {
    it('should create service with DynamoDB repository', () => {
      const testServiceConstructor: DynamoDBIdentityService =
        new ServiceFactory({
          tableName,
          identityTableName,
        }).getService('identity');
      expect(testServiceConstructor).toBeInstanceOf(DynamoDBIdentityService);
    });
  });

  describe('Get All Linked Service', () => {
    const serviceId = 'test';
    const serviceName = 'test-service';
    const udpId = 'mock-string-uuid4';
    const pk = serviceName.concat('#', serviceId);
    const identity = {
      ...mockAppIdentityRecord,
      pk,
      serviceName,
      serviceId,
      udpId,
    };

    it('should return an array of linked service names, filtering out expired identities', async () => {
      const identities: IdentityRecordEntity[] = [
        {
          pk: 'app#app-id',
          sk: udpId,
          serviceName: 'app',
          serviceId: 'app-id',
          udpId,
        },
        {
          pk: 'dwp#dwp-id',
          sk: udpId,
          serviceName: 'dwp',
          serviceId: 'dwp-id',
          udpId,
        },
        {
          pk: 'dvla#dvla-id',
          sk: udpId,
          serviceName: 'dvla',
          serviceId: 'dvla-id',
          udpId,
          ttl: Math.floor(Date.parse('2026-01-01') / 1000),
        },
      ];

      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [identity] })
        .resolvesOnce({ Items: identities });

      const result = await service.getAllLinkedServices(serviceName, serviceId);

      expect(getCommandCall(QueryCommand, 1)).toMatchObject({
        TableName: identityTableName,
        KeyConditionExpression: 'pk = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        Limit: 1,
      });
      expect(getCommandCall(QueryCommand, 2)).toMatchObject({
        TableName: identityTableName,
        IndexName: 'sk-index',
        KeyConditionExpression: 'sk = :sk',
        ExpressionAttributeValues: { ':sk': udpId },
      });
      expect(result).toEqual(['app', 'dwp']);
    });

    it('should return an empty array and log when no linked services exist', async () => {
      dynamoMock
        .on(QueryCommand)
        .resolvesOnce({ Items: [identity] })
        .resolvesOnce({ Items: [] });

      const result = await service.getAllLinkedServices(serviceName, serviceId);

      expect(result).toEqual([]);
    });

    it('should throw IdentityRecordNotFoundError when the initial identity does not exist', async () => {
      dynamoMock.on(QueryCommand).resolvesOnce({ Items: [] });

      await expect(
        service.getAllLinkedServices(serviceName, serviceId),
      ).rejects.toThrow(IdentityRecordNotFoundError);
    });

    it('should throw underlying error if DB failure', async () => {
      const mockError = new Error('DB Failure');

      dynamoMock.on(QueryCommand).rejects(mockError);

      await expect(
        service.getAllLinkedServices(serviceName, serviceId),
      ).rejects.toThrow(mockError);
    });
  });
});
