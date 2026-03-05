import { describe, it, expect, vi, beforeEach } from 'vitest';
import { lambdaHandler } from './handler';
import type { SQSEvent } from 'aws-lambda';

// Mock dependencies
vi.mock('@libs/utils', () => ({
  getTracer: vi.fn(() => ({ putAnnotation: vi.fn() })),
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  })),
  captureLambdaHandler: vi.fn(() => ({
    before: vi.fn(),
  })),
  injectLambdaContext: vi.fn(() => ({
    before: vi.fn(),
  })),
  createEnvValidator: vi.fn(() => ({
    middleware: { before: vi.fn() },
    getEnv: vi.fn(() => ({
      TABLE_NAME: 'test-table',
      IDENTITY_TABLE_NAME: 'test-identity-table',
      BUCKET_NAME: 'test-bucket',
      DLQ_URL: 'test-dlq-url',
      KMS_KEY_ID: 'test-kms-key',
    })),
  })),
}));

vi.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: vi.fn(() => ({
    send: vi.fn(),
  })),
  SendMessageCommand: vi.fn(),
}));

vi.mock('@aws-sdk/client-s3', () => ({
  S3Client: vi.fn(() => ({
    send: vi.fn(),
  })),
  PutObjectCommand: vi.fn(),
}));

vi.mock('@libs/data-access', () => ({
  ServiceFactory: vi.fn(() => ({
    getService: vi.fn((serviceName: string) => {
      if (serviceName === 'identity') {
        return {
          getByServiceId: vi.fn(async () => ({
            udpId: 'test-udp-id',
            serviceName: 'test-service',
            serviceId: 'test-user-id',
          })),
        };
      }
      if (serviceName === 'data') {
        return {
          getAllByUdpID: vi.fn(async () => [
            {
              pk: 'test-udp-id',
              sk: '/test/path',
              data: { field1: 'value1' },
              ttl: 12345,
            },
          ]),
        };
      }
      return {};
    }),
  })),
}));

describe('createSarFileLambda', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should process SAR request successfully', async () => {
    const mockEvent: SQSEvent = {
      Records: [
        {
          messageId: 'test-message-id',
          receiptHandle: 'test-receipt-handle',
          body: JSON.stringify({
            sarID: 'test-sar-id',
            serviceName: 'test-service',
            serviceUserId: 'test-user-id',
          }),
          attributes: {} as any,
          messageAttributes: {},
          md5OfBody: 'test-md5',
          eventSource: 'aws:sqs',
          eventSourceARN: 'test-arn',
          awsRegion: 'us-east-1',
        },
      ],
    };

    await expect(lambdaHandler(mockEvent)).resolves.not.toThrow();
  });
});
