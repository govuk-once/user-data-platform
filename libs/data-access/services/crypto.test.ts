import { EncryptionConfig } from '../types/Entity';
import { encryptItem, decryptItem } from './crypto';
import { EncryptionService } from './EncryptionService';

describe('Crypto helpers', () => {
  const encryptFields = vi.fn();
  const decryptFields = vi.fn();

  const encryption: EncryptionConfig = {
    service: { encryptFields, decryptFields } as unknown as EncryptionService,
    dataFields: ['data'],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('encryoptItem', () => {
    it('returns the item untouched when no encryption is configured', async () => {
      const item = { pk: '123', sk: 'topics', data: { a: 1 } };

      const result = await encryptItem(item, undefined);

      expect(result).toBe(item);
      expect(encryptFields).not.toHaveBeenCalled();
    });

    it('delegates to EncryptionService with the configured fields', async () => {
      const item = { pk: '123', sk: 'topics', data: { a: 1 } };
      const encrypted = { ...item, data: 'cipher', __datakey: 'key' };
      const result = await encryptItem(item, encryption);

      expect(encryptFields).toHaveBeenCalledWith(item, ['data']);
      expect(result).toBe(encrypted);
    });
  });

  describe('decryptItem', () => {
    it('returns the item untouched when no encryption is configured', async () => {
      const item = { pk: '123', sk: 'topics', data: { a: 1 } };

      const result = await decryptItem(item, undefined);

      expect(result).toBe(item);
      expect(decryptFields).not.toHaveBeenCalled();
    });

    it('delegates to EncryptionService with the configured fields', async () => {
      const stored = {
        pk: '123',
        sk: 'topics',
        data: 'cipher',
        __datakey: 'k',
      };

      const plain = { pk: '123', sk: 'topics', data: { a: 1 } };
      decryptFields.mockResolvedValue(plain);

      const result = await decryptItem(stored, encryption);

      expect(decryptFields).toHaveBeenCalledWith(stored, ['data']);
      expect(result).toBe(plain);
    });
  });
});
