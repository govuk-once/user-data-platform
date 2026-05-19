import { S3Entity } from '../types/Entity';
import { S3RepositoryBase } from './Repository';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NoSuchKey,
  NotFound,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Logger } from '@libs/utils';

/**
 * TODO
 * @template T - The entity type that extends S3Entity
 */
export class S3Repository<T extends S3Entity> implements S3RepositoryBase<T> {
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly logger?: Logger;

  /**
   * Creates a new DynamoDB repository instance.
   * @param bucketName - The name of the DynamoDB table to use
   * @param client - DynamoDB Document Client instance (should be created outside constructor for Lambda performance)
   */
  constructor(bucketName: string, client: S3Client, logger?: Logger) {
    this.bucketName = bucketName;
    this.client = client;
    this.logger = logger;
  }

  private validateKeys(keys: Partial<T>) {
    if (!keys.key) {
      throw new Error('S3Entity requires a key');
    }
    return { key: keys.key };
  }

  async get(keys: Partial<T>): Promise<T | null> {
    const { key } = this.validateKeys(keys);

    this.logger?.debug('Getting object from S3', {
      operation: 'get',
      bucketName: this.bucketName,
      key,
    });

    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });

    try {
      const response = await this.client.send(command);

      const body = await response.Body?.transformToString('utf-8');

      this.logger?.debug('Object retrieved successfully', { key });

      return {
        key,
        body,
        contentType: response.ContentType,
        metadata: response.Metadata,
      } as T;
    } catch (error) {
      if (error instanceof NoSuchKey) {
        this.logger?.debug('Object not found', { key });
      }

      throw error;
    }
  }

  async save(key: string, content: string): Promise<void> {
    this.logger?.debug('Saving object to S3', {
      operation: 'save',
      bucketName: this.bucketName,
      key,
    });

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: content,
      ContentType: 'application/octet-stream',
    });

    await this.client.send(command);

    this.logger?.debug('Object saved successfully', {
      key,
    });
  }

  async delete(key: string): Promise<boolean | null> {
    this.logger?.debug('Deleting object from S3', {
      operation: 'delete',
      bucketName: this.bucketName,
      key,
    });

    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
    } catch (error) {
      if (error instanceof NotFound || error instanceof NoSuchKey) {
        this.logger?.debug('Object deleted successfully', { key });
      }
      throw error;
    }

    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
    );

    this.logger?.debug('Object deleted successfully', { key });

    return true;
  }
}
