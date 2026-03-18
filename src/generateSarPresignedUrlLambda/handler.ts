import middy from '@middy/core';
import type { S3Event } from 'aws-lambda';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  requireEnvVars,
} from '@libs/utils';
import {
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { ServiceFactory } from '@libs/data-access';

const { TABLE_NAME } = requireEnvVars('TABLE_NAME');

const { STACK: stack, SERVICE_NAME: serviceName = 'generateSarPresignedUrl' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const s3Client = new S3Client({});

const factory = new ServiceFactory({
  tableName: TABLE_NAME,
  identityTableName: process.env.IDENTITY_TABLE_NAME || 'not-required',
  kmsKeyId: process.env.KMS_KEY_ID,
  tracer,
});

/**
 * Generates a pre-signed URL for a SAR file and writes the record to DynamoDB
 */
export const lambdaHandler = async (event: S3Event) => {
  for (const record of event.Records) {
    try {
      const bucket = record.s3.bucket.name;
      const objectKey = decodeURIComponent(
        record.s3.object.key.replace(/\+/g, ' '),
      );

      logger.info('Processing S3 object created event', {
        bucket,
        objectKey,
      });

      // Extract sarID from object key (format: {sarID}.json)
      const sarID = objectKey.replace('.json', '');

      // Get object metadata to retrieve udpID
      const headResponse = await s3Client.send(
        new HeadObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
      );

      const udpId = headResponse.Metadata?.udpid;

      if (!udpId) {
        logger.error('No udpId found in S3 object metadata', {
          bucket,
          objectKey,
          sarID,
        });
        throw new Error('Missing udpId in S3 object metadata');
      }

      logger.info('Retrieved udpId from S3 metadata', {
        sarID,
        udpId,
      });

      // Generate pre-signed URL with 7-day expiry
      const presignedUrlExpiry = 7 * 24 * 60 * 60; // 7 days in seconds
      const presignedURL = await getSignedUrl(
        s3Client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: objectKey,
        }),
        { expiresIn: presignedUrlExpiry },
      );

      // Calculate expiry timestamps
      const now = Math.floor(Date.now() / 1000); // Current time in seconds
      const expiresAt = now + presignedUrlExpiry;

      // S3 object expires after 90 days (from lifecycle policy)
      const s3ObjectExpiry = now + 90 * 24 * 60 * 60; // 90 days in seconds

      // Create SAR record
      const sarRecord = {
        pk: udpId,
        sk: `SAR/${sarID}`,
        sarID,
        ttl: s3ObjectExpiry, // DynamoDB TTL (no milliseconds)
        expiresAt: expiresAt * 1000, // Timestamp with milliseconds for pre-signed URL expiry
        presignedURL,
        bucket,
        objectKey,
      };

      // Save to DynamoDB
      await factory.getService('sar').save(sarRecord);

      logger.info('SAR record created successfully', {
        sarID,
        udpId,
        expiresAt: new Date(expiresAt * 1000).toISOString(),
        s3ObjectExpiry: new Date(s3ObjectExpiry * 1000).toISOString(),
      });

      tracer.putAnnotation('sarRecordCreated', true);
    } catch (error) {
      logger.error('Error processing S3 event', {
        error,
        record: JSON.stringify(record),
      });

      tracer.putAnnotation('sarRecordFailed', true);

      // Re-throw to trigger Lambda retry
      throw error;
    }
  }
};

export const handler = middy()
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  .use({
    before: async () => {
      tracer.putAnnotation('stack', stack);
    },
  })
  .handler(lambdaHandler);
