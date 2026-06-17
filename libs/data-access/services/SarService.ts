import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from '@aws-sdk/lib-dynamodb';
import { Logger } from '@libs/utils';
import { EncryptionConfig, SAREntity } from '../types/Entity';
import { decryptItem, encryptItem } from './crypto';

/**
 * Reads and writes SAR (Subject Access Request) records in DynamoDB.
 *
 * Records are keyed by udpId (partition) and `SAR/{sarId}` (sort). The
 * pre-signed URL is encrypted at rest when the factory is configured with a
 * KMS key.
 */
export class SarService {
  constructor(
    private readonly client: DynamoDBDocumentClient,
    private readonly tableName: string,
    private readonly encryption?: EncryptionConfig,
    private readonly logger?: Logger,
  ) {}

  public async get(keys: {
    pk: string;
    sk: string;
  }): Promise<SAREntity | null> {
    const response = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: keys.pk, sk: keys.sk },
      }),
    );

    if (!response.Item) {
      return null;
    }

    return decryptItem<SAREntity>(response.Item, this.encryption);
  }

  public async save(entity: SAREntity): Promise<SAREntity> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: await encryptItem(entity, this.encryption),
      }),
    );

    return entity;
  }
}
