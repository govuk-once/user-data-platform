import middy from '@middy/core';
import type { SQSEvent } from 'aws-lambda';
import {
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  requireEnvVars,
} from '@libs/utils';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

import { ServiceFactory } from '@libs/data-access';

const { TABLE_NAME, IDENTITY_TABLE_NAME, BUCKET_NAME, DLQ_URL } =
  requireEnvVars('TABLE_NAME', 'IDENTITY_TABLE_NAME', 'BUCKET_NAME', 'DLQ_URL');

const { STACK: stack, SERVICE_NAME: serviceName = 'createSARFile' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

const sqsClient = new SQSClient({});
const s3Client = new S3Client({});

const factory = new ServiceFactory({
  tableName: TABLE_NAME,
  identityTableName: IDENTITY_TABLE_NAME,
  kmsKeyId: process.env.KMS_KEY_ID,
  tracer,
  logger,
});

/**
 * Sanitizes a data record by removing internal fields (pk, sk, ttl, etc.)
 * and returning only the user data
 */
function sanitizeDataRecord(record: {
  pk: string;
  sk: string;
  ttl?: number;
  [key: string]: unknown;
}): Record<string, unknown> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { pk, sk, ttl, ...sanitizedData } = record;
  return {
    resourcePath: sk,
    ...sanitizedData,
  };
}

export const lambdaHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    let sarID: string;
    let serviceName: string;
    let serviceUserId: string;

    try {
      const messageBody = JSON.parse(record.body);
      sarID = messageBody.sarID;
      serviceName = messageBody.serviceName;
      serviceUserId = messageBody.serviceUserId;

      logger.info('Processing SAR request', {
        sarID,
        serviceName,
        serviceUserId,
      });

      // Step 1: Get the identity record to fetch the udpId
      const identity = await factory
        .getService('identity')
        .getByServiceId(serviceName, serviceUserId);

      const udpId = identity.udpId;

      logger.info('Retrieved udpId from identity', { sarID, udpId });

      // Step 2: Query all data records for this udpId
      const dataRecords = await factory.getService('data').getAllByUdpID(udpId);

      logger.info('Retrieved data records', {
        sarID,
        udpId,
        recordCount: dataRecords.length,
      });

      // Step 3: Sanitize the data records
      const sanitizedRecords = dataRecords.map(sanitizeDataRecord);

      // Step 4: Create JSON blob
      const jsonBlob = JSON.stringify(sanitizedRecords, null, 2);

      // Step 5: Store in S3
      const s3Key = `${sarID}.json`;
      await s3Client.send(
        new PutObjectCommand({
          Bucket: BUCKET_NAME,
          Key: s3Key,
          Body: jsonBlob,
          ContentType: 'application/json',
          ServerSideEncryption: 'aws:kms',
          Metadata: {
            udpid: udpId,
            sarid: sarID,
          },
        }),
      );

      logger.info('SAR file created successfully', {
        sarID,
        udpId,
        s3Key,
        recordCount: sanitizedRecords.length,
      });

      tracer.putAnnotation('sarFileCreated', true);
    } catch (error) {
      logger.error('Error processing SAR request', {
        error,
        sarID,
        serviceName,
        serviceUserId,
      });

      // Send message to DLQ
      await sqsClient.send(
        new SendMessageCommand({
          QueueUrl: DLQ_URL,
          MessageBody: record.body,
        }),
      );

      logger.info('Message sent to DLQ', { sarID });
      tracer.putAnnotation('sarFileFailed', true);
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
