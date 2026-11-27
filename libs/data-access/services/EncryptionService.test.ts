import { KMSClient } from '@aws-sdk/client-kms';
import { EncryptionService } from './EncryptionService';

const mockPlainTextKey = Buffer.alloc(32, 'a');
const mockEncryptedKey = Buffer.from('encrypted-key-data');

const sendMock = vi.fn();
const mockKmsClient = {
  send: sendMock,
} as unknown as KMSClient;

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    sendMock.mockImplementation((command) => {
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
    });

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

      const encrypted: typeof data & { __dataKey: string } =
        await service.encryptFields(data, ['data']);
      const decrypted = await service.decryptFields(encrypted, ['data']);

      expect(decrypted).toEqual(data);
      expect('__dataKey' in decrypted).toBe(false);
    });

    it('Should decrypt fields and restore JSON Objects', async () => {
      const data = {
        pk: '123',
        sk: 'topics',
        data: { test: 'test' },
      };

      const encrypted: typeof data & { __dataKey: string } =
        await service.encryptFields(data, ['data']);
      const decrypted = await service.decryptFields(encrypted, ['data']);

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

    describe('integrity failures', () => {
      const emittedMetrics = (spy: ReturnType<typeof vi.spyOn>) =>
        spy.mock.calls
          .map(([line]) => String(line))
          .filter((line) => line.includes('"_aws"'))
          .map((line) => JSON.parse(line));

      it('emits a DecryptionFailure metric and rethrows when the auth tag check fails', async () => {
        const stdoutSpy = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation(() => true);
        const encrypted = await service.encryptFields(
          { pk: '123', sk: 'topics', data: { test: 'test' } },
          ['data'],
        );
        const tampered = Buffer.from(
          encrypted.data as unknown as string,
          'base64',
        );
        tampered[tampered.length - 1] ^= 0xff;

        await expect(
          service.decryptFields(
            { ...encrypted, data: tampered.toString('base64') } as never,
            ['data'],
          ),
        ).rejects.toThrow();

        const [metric] = emittedMetrics(stdoutSpy);
        expect(metric.DecryptionFailure).toBe(1);
        expect(metric.decryptStage).toBe('cipher');
        expect(metric._aws.CloudWatchMetrics[0].Namespace).toBe('UDP');
        stdoutSpy.mockRestore();
      });

      it('emits a DecryptionFailure metric and rethrows when KMS cannot decrypt the data key', async () => {
        const stdoutSpy = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation(() => true);
        const encrypted = await service.encryptFields(
          { pk: '123', sk: 'topics', data: { test: 'test' } },
          ['data'],
        );
        const kmsError = Object.assign(new Error('key disabled'), {
          name: 'DisabledException',
        });
        sendMock.mockRejectedValueOnce(kmsError);

        await expect(service.decryptFields(encrypted, ['data'])).rejects.toBe(
          kmsError,
        );

        const [metric] = emittedMetrics(stdoutSpy);
        expect(metric.decryptStage).toBe('kms');
        expect(metric.errorName).toBe('DisabledException');
        stdoutSpy.mockRestore();
      });

      it('does not emit a metric on a successful decrypt', async () => {
        const stdoutSpy = vi
          .spyOn(process.stdout, 'write')
          .mockImplementation(() => true);
        const encrypted = await service.encryptFields(
          { pk: '123', sk: 'topics', data: { test: 'test' } },
          ['data'],
        );
        await service.decryptFields(encrypted, ['data']);

        expect(emittedMetrics(stdoutSpy)).toHaveLength(0);
        stdoutSpy.mockRestore();
      });
    });
  });
});
