import { EncryptionConfig } from '../types/Entity';
import { EncryptedData } from './EncryptionService';

/**
 * Field-level encryption helpers shared by the data-access services.
 *
 * Each service owns its own DynamoDB queries but applies envelope encryption
 * the same way: encrypt the configured fields before a write, decrypt them
 * after a read. When no encryption is configured the item passes through
 * unchanged.
 */

/**
 * Encrypts the configured fields on an item before it is written to DynamoDB.
 */
export const encryptItem = async <T extends object>(
  item: T,
  encryption?: EncryptionConfig,
): Promise<Record<string, unknown>> => {
  const record = item as Record<string, unknown>;
  return encryption
    ? encryption.service.encryptFields(record, encryption.dataFields)
    : record;
};

/**
 * Decrypts the configured fields on an item read from DynamoDB.
 */
export const decryptItem = async <T>(
  item: Record<string, unknown>,
  encryption?: EncryptionConfig,
): Promise<T> =>
  encryption
    ? ((await encryption.service.decryptFields(
        item as Record<string, unknown> & EncryptedData,
        encryption.dataFields,
      )) as T)
    : (item as T);
