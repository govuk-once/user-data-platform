import {
  DecryptCommand,
  GenerateDataKeyCommand,
  KMSClient,
} from '@aws-sdk/client-kms';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

export interface EncryptionServiceConfig {
  kmsKeyId: string;
  kmsClient?: KMSClient;
}

export interface EncryptedData {
  __dataKey: string;
}

export class EncryptionService {
  private readonly kmsClient: KMSClient;
  private readonly kmsKeyId: string;

  constructor(config: EncryptionServiceConfig) {
    this.kmsKeyId = config.kmsKeyId;
    this.kmsClient = config.kmsClient ?? new KMSClient({});
  }

  async encryptFields<T extends Record<string, unknown>>(
    data: T,
    fieldsToEncrypt: string[],
  ): Promise<T & EncryptedData> {
    const { plaintextKey, encryptedKey } = await this.generateDataKey();

    const encryptedData = { ...data } as T & EncryptedData;

    for (const field of fieldsToEncrypt) {
      if (field in data && data[field] !== undefined && data[field] !== null) {
        const value = data[field];
        const stringvalue =
          typeof value === 'string' ? value : JSON.stringify(value);
        (encryptedData as Record<string, unknown>)[field] = this.encrypt(
          stringvalue,
          plaintextKey,
        );
      }
    }

    encryptedData.__dataKey = encryptedKey;

    return encryptedData;
  }

  async decryptFields<T extends Record<string, unknown> & EncryptedData>(
    data: T,
    fieldsToDecrypt: string[],
  ): Promise<Omit<T, '__dataKey'>> {
    const { __dataKey, ...rest } = data;

    if (!__dataKey) {
      return rest as Omit<T, '__dataKey'>;
    }

    const plaintextKey = await this.decryptDataKey(__dataKey);
    const decryptedData = { ...rest };

    for (const field of fieldsToDecrypt) {
      const encryptedValue = decryptedData[
        field as keyof typeof decryptedData
      ] as string;
      const decryptedValue = this.decrypt(encryptedValue, plaintextKey);

      try {
        (decryptedData as Record<string, unknown>)[field] =
          JSON.parse(decryptedValue);
      } catch {
        (decryptedData as Record<string, unknown>)[field] = decryptedValue;
      }
    }

    return decryptedData as Omit<T, '__dataKey'>;
  }

  private async generateDataKey(): Promise<{
    plaintextKey: Buffer;
    encryptedKey: string;
  }> {
    const command = new GenerateDataKeyCommand({
      KeyId: this.kmsKeyId,
      KeySpec: 'AES_256',
    });

    const response = await this.kmsClient.send(command);

    if (!response.Plaintext || !response.CiphertextBlob) {
      throw new Error('Failed to generate key data from KMS');
    }

    return {
      plaintextKey: Buffer.from(response.Plaintext),
      encryptedKey: Buffer.from(response.CiphertextBlob).toString('base64'),
    };
  }

  private async decryptDataKey(encyptedKey: string): Promise<Buffer> {
    const command = new DecryptCommand({
      CiphertextBlob: Buffer.from(encyptedKey, 'base64'),
    });

    const response = await this.kmsClient.send(command);

    if (!response.Plaintext) {
      throw new Error('Failed to decrytp the key');
    }

    return Buffer.from(response.Plaintext);
  }

  private encrypt(plainText: string, key: Buffer): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const encrypted = Buffer.concat([
      cipher.update(plainText, 'utf-8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  private decrypt(cipherText: string, key: Buffer): string {
    const combined = Buffer.from(cipherText, 'base64');

    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]);

    return decrypted.toString('utf-8');
  }
}
