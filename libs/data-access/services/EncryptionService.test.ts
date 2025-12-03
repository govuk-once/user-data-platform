import { KMSClient } from '@aws-sdk/client-kms';
import { beforeEach, vi, describe, expect, it } from 'vitest';
import { EncryptionService } from './EncryptionService';

const mockPlainTextKey = Buffer.alloc(32, 'a');
const mockEncryptedKey = Buffer.from('encrypted-key-data');

const mockKmsClient = {
  send: vi.fn(),
} as unknown as KMSClient;

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    (mockKmsClient.send as ReturnType<typeof vi.fn>).mockImplementation(
      (command) => {
        if (command.constructor.name === 'GenerateDataKeyCommand') {
          return Promise.resolve({
            Plaintext: mockPlainTextKey,
            CiphertextBlob: mockEncryptedKey,
          });
        }
        if (command.constructor.name === 'DecryptCommand') {
          return Promise.resolve({
            Plaintext: mockPlainTextKey,
          });
        }

        return Promise.reject(new Error('unknown command'));
      },
    );

    service = new EncryptionService({
      kmsKeyId: 'test-key-id',
      kmsClient: mockKmsClient,
    });
  });

  describe('encryptFields', () => {
    it('should encrypt the specified fields and add a __dataKey', async () => {
      const data = {
        pk: '123',
        sk: 'topics',
        data: { topicIds: ['123'] },
      };

      const result = await service.encryptFields(data, ['data']);

      expect(result.__dataKey).toBe(mockEncryptedKey.toString('base64'));
      expect(result.data).not.toBe({ topicIds: ['123'] });
    });

    it('should handle encrypting string data', async () => {
      const data = {
        pk: '123',
        sk: 'topics',
        stringField: 'stringField',
      };

      const result = await service.encryptFields(data, ['stringField']);

      expect(result.__dataKey).toBe(mockEncryptedKey.toString('base64'));
      expect(result.stringField).not.toBe('stringField');
    });

    it('should skip undefined or null fields', async () => {
      const data = {
        pk: '123',
        sk: 'topics',
        nullField: null,
        undefinedField: undefined,
      };

      const result = await service.encryptFields(data, [
        'undefinedField',
        'nullField',
      ]);

      expect(result.__dataKey).toBe(mockEncryptedKey.toString('base64'));
      expect(result.nullField).toBe(null);
      expect(result.undefinedField).toBe(undefined);
    });
  });

  describe('decryptFiedls', () => {
    it('Should decrypt fields and remove the __datakey', async () => {
      const data = {
        pk: '123',
        sk: 'topics',
        data: 'string',
      };

      const encrypted = await service.encryptFields(data, ['data']);
      const decrypted = await service.decryptFields(
        encrypted as typeof data & { __dataKey: string },
        ['data'],
      );

      expect(decrypted).toEqual(data);
      expect('__dataKey' in decrypted).toBe(false);
    });

    it('Should decrypt fields and restore JSON Objects', async () => {
      const data = {
        pk: '123',
        sk: 'topics',
        data: { test: 'test' },
      };

      const encrypted = await service.encryptFields(data, ['data']);
      const decrypted = await service.decryptFields(
        encrypted as typeof data & { __dataKey: string },
        ['data'],
      );

      expect(decrypted).toEqual(data);
      expect('__dataKey' in decrypted).toBe(false);
    });

    it('Should return data as iss if no __dataKey', async () => {
      const data = {
        pk: '123',
        sk: 'topics',
        data: { test: 'test' },
      };

      const decrypted = await service.decryptFields(
        data as typeof data & { __dataKey: string },
        ['data'],
      );

      expect(decrypted).toEqual(data);
      expect('__dataKey' in decrypted).toBe(false);
    });
  });
});
