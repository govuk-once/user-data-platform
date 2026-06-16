import { EncryptionConfig } from '../types/Entity';
import { EncryptedData } from './EncryptionService';

export const encryptItem = async <T extends object>(
  item: T,
  encryption?: EncryptionConfig,
): Promise<Record<string, unknown>> => {
  const record = item as Record<string, unknown>;
  return encryption
    ? encryption.service.encryptFields(record, encryption.dataFields)
    : record;
};

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
