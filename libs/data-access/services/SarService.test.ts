/* eslint-disable  @typescript-eslint/no-explicit-any */

import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { mockClient } from 'aws-sdk-client-mock';
import { SarService } from './SarService';
import { ServiceFactory } from '../factory/ServiceFactory';
import { SAREntity } from '../types/Entity';

const dynamoMock = mockClient(DynamoDBDocumentClient);
const kmsMock = mockClient(KMSClient);

const getCommandCall = (command: any, callNumber: number) =>
  dynamoMock.commandCalls(command)[callNumber - 1].args[0].input;

const tableName = 'test-data-service';

const sarRecord: SAREntity = {
  pk: 'a1b2c3d4-udp-id',
  sk: 'SAR/sar-123',
  sarID: 'sar-123',
  ttl: 1893456000,
  expiresAt: 1893456000000,
  presignedURL: 'https://example.com/signed',
  bucket: 'sar-bucket',
  objectKey: 'sar-123.json',
};

describe('SarService', () => {
  const service: SarService = new ServiceFactory({
    tableName,
    identityTableName: 'test-identity-service',
  }).getService('sar');

  beforeEach(() => {
    dynamoMock.reset();
    kmsMock.reset();
  });

  describe('get', () => {
    it('fetches a record by composite key', async () => {
      dynamoMock.on(GetCommand).resolves({ Item: sarRecord });

      const result = await service.get({
        pk: sarRecord.pk,
        sk: sarRecord.sk,
      });

      expect(getCommandCall(GetCommand, 1)).toMatchObject({
        TableName: tableName,
        Key: { pk: sarRecord.pk, sk: sarRecord.sk },
      });
      expect(result).toEqual(sarRecord);
    });

    it('returns null when the record does not exist', async () => {
      dynamoMock.on(GetCommand).resolves({});

      const result = await service.get({ pk: 'missing', sk: 'SAR/none' });

      expect(result).toBeNull();
    });

    it('throws the underlying error when the get fails', async () => {
      const error = new Error('DynamoDB unavailable');
      dynamoMock.on(GetCommand).rejects(error);

      await expect(
        service.get({ pk: sarRecord.pk, sk: sarRecord.sk }),
      ).rejects.toThrow(error);
    });
  });

  describe('save', () => {
    it('writes the record and returns it', async () => {
      dynamoMock.on(PutCommand).resolves({});

      const result = await service.save(sarRecord);

      expect(getCommandCall(PutCommand, 1)).toMatchObject({
        TableName: tableName,
        Item: sarRecord,
      });
      expect(result).toEqual(sarRecord);
    });

    it('throws the underlying error when the save fails', async () => {
      const error = new Error('DynamoDB unavailable');
      dynamoMock.on(PutCommand).rejects(error);

      await expect(service.save(sarRecord)).rejects.toThrow(error);
    });
  });

  describe('with encryption configured', () => {
    const key = Buffer.alloc(32, 'a');
    const encryptedKey = Buffer.from('encrypted-key-data');

    const encryptedService: SarService = new ServiceFactory({
      tableName,
      identityTableName: 'test-identity-service',
      kmsKeyId: 'test-key-id',
    }).getService('sar');

    beforeEach(() => {
      kmsMock.on(GenerateDataKeyCommand).resolves({
        Plaintext: key,
        CiphertextBlob: encryptedKey,
      });
      kmsMock.on(DecryptCommand).resolves({ Plaintext: key });
    });

    it('encrypts the presignedURL on save and decrypts it on get', async () => {
      dynamoMock.on(PutCommand).resolves({});

      await encryptedService.save(sarRecord);

      const storedItem = getCommandCall(PutCommand, 1).Item;
      expect(storedItem.__dataKey).toBe(encryptedKey.toString('base64'));
      expect(storedItem.presignedURL).not.toBe(sarRecord.presignedURL);

      dynamoMock.on(GetCommand).resolves({ Item: storedItem });

      const result = await encryptedService.get({
        pk: sarRecord.pk,
        sk: sarRecord.sk,
      });

      expect(result?.presignedURL).toBe(sarRecord.presignedURL);
      expect(result && '__dataKey' in result).toBe(false);
    });
  });
});
