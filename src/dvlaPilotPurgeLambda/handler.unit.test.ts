import { Context } from 'aws-lambda';
import { DynamoDBClient, ScanCommand, DeleteItemCommand } from '@aws-sdk/client-dynamodb';
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { mockClient } from 'aws-sdk-client-mock';
import { handler } from './handler';

vi.hoisted(() => {
  process.env['IDENTITY_TABLE_NAME'] = 'test-identity-table';
  process.env['PURGE_KEY_SECRET_NAME'] = '/test/dvla/pilot/purge-key';
});

const dynamoMock = mockClient(DynamoDBClient);
const secretsMock = mockClient(SecretsManagerClient);

const mockPurgeKey = 'test-purge-key-uuid-1234';

const mockContext: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'dvla-pilot-purge',
  functionVersion: '1',
  invokedFunctionArn: 'arn:aws:lambda:eu-west-2:123456789012:function:dvla-pilot-purge',
  memoryLimitInMB: '512',
  awsRequestId: 'test-request-id',
  logGroupName: '/aws/lambda/dvla-pilot-purge',
  logStreamName: 'test-stream',
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
};

const makeDvlaItem = (id: string) => ({
  pk: { S: `dvla#${id}` },
  sk: { S: `link#${id}` },
});

const chunk = <T>(items: T[], size: number): T[][] => {
    const batches: T[][] = [];
    for (let index = 0; index < items.length; index += size) {
        batches.push(items.slice(index, index + size));
    }

    return batches;
};

describe('dvlaPilotPurgeLambda handler', () => {
  beforeEach(() => {
    dynamoMock.reset();
    secretsMock.reset();
    vi.clearAllMocks();
  });

  const mockValidPurgeKey = () => {
    secretsMock.on(GetSecretValueCommand).resolves({
      SecretString: mockPurgeKey,
    });
  };

  describe('Purge key validation', () => {
    it('should throw when the supplied key does not match the secret', async () => {
      secretsMock.on(GetSecretValueCommand).resolves({
        SecretString: 'correct-key',
      });

      await expect(
        handler({ key: 'wrong-key' }, mockContext),
      ).rejects.toThrow('Unauthorised: invalid purge key');
    });

    it('should throw when the secret has no value', async () => {
      secretsMock.on(GetSecretValueCommand).resolves({
        SecretString: undefined,
      });

      await expect(
        handler({ key: mockPurgeKey }, mockContext),
      ).rejects.toThrow('Unauthorised: invalid purge key');
    });

    it('should throw when secrets manager call fails', async () => {
      secretsMock
        .on(GetSecretValueCommand)
        .rejects(new Error('Secrets Manager Error'));

      await expect(
        handler({ key: mockPurgeKey }, mockContext),
      ).rejects.toThrow('Secrets Manager Error');
    });
  });

  describe('Successful operations', () => {
    it('should complete without deleting anything when no DVLA records exist', async () => {
      mockValidPurgeKey();

      dynamoMock.on(ScanCommand).resolves({
        Items: [],
        LastEvaluatedKey: undefined,
      });

      await handler({ key: mockPurgeKey }, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteItemCommand);
      expect(deleteCalls).toHaveLength(0);
    });

    it('should delete all fetched DVLA records', async () => {
      mockValidPurgeKey();

      const items = [makeDvlaItem('1'), makeDvlaItem('2'), makeDvlaItem('3')];

      dynamoMock.on(ScanCommand).resolves({
        Items: items,
        LastEvaluatedKey: undefined,
      });

      dynamoMock.on(DeleteItemCommand).resolves({});

      await handler({ key: mockPurgeKey }, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteItemCommand);
      expect(deleteCalls).toHaveLength(3);
    });

    it('should paginate the scan when LastEvaluatedKey is returned', async () => {
      mockValidPurgeKey();

      const page1Items = Array.from({ length: 3 }, (_, i) => makeDvlaItem(`page1-${i}`));
      const page2Items = Array.from({ length: 2 }, (_, i) => makeDvlaItem(`page2-${i}`));
      const lastEvaluatedKey = { pk: { S: 'dvla#page1-2' }, sk: { S: 'link#page1-2' } };

      dynamoMock
        .on(ScanCommand)
        .resolvesOnce({
          Items: page1Items,
          LastEvaluatedKey: lastEvaluatedKey,
        })
        .resolvesOnce({
          Items: page2Items,
          LastEvaluatedKey: undefined,
        });

      dynamoMock.on(DeleteItemCommand).resolves({});

      await handler({ key: mockPurgeKey }, mockContext);

      const scanCalls = dynamoMock.commandCalls(ScanCommand);
      const deleteCalls = dynamoMock.commandCalls(DeleteItemCommand);
      expect(scanCalls).toHaveLength(2);
      expect(scanCalls[1].args[0].input).toEqual(
        expect.objectContaining({
            ExclusiveStartKey: lastEvaluatedKey,
        }),
      );
      expect(deleteCalls).toHaveLength(5);
    });

    it('should process records across multiple batches of 100', async () => {
      mockValidPurgeKey();

      const items = Array.from({ length: 250 }, (_, i) => makeDvlaItem(`${i}`));
      const batches = chunk(items, 100);

      dynamoMock.on(ScanCommand).resolves({
        Items: items,
        LastEvaluatedKey: undefined,
      });

      dynamoMock.on(DeleteItemCommand).resolves({});

      await handler({ key: mockPurgeKey }, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteItemCommand);
      
      expect(batches).toHaveLength(3);
      expect(batches[0]).toHaveLength(100);
      expect(batches[1]).toHaveLength(100);
      expect(batches[2]).toHaveLength(50);
      expect(deleteCalls).toHaveLength(250);
    });

    it('should skip items missing pk or sk', async () => {
      mockValidPurgeKey();

      dynamoMock.on(ScanCommand).resolves({
        Items: [
          { pk: { S: 'dvla#1' }, sk: { S: 'link#1' } },
          { pk: { S: 'dvla#2' } },
          { sk: { S: 'link#3' } },
          { pk: { S: 'dvla#4' }, sk: { S: 'link#4' } },
        ],
        LastEvaluatedKey: undefined,
      });

      dynamoMock.on(DeleteItemCommand).resolves({});

      await handler({ key: mockPurgeKey }, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteItemCommand);
      expect(deleteCalls).toHaveLength(2);
    });
  });

  describe('Error handling', () => {
    it('should continue deleting remaining records when some deletions fail', async () => {
      mockValidPurgeKey();

      const items = [makeDvlaItem('1'), makeDvlaItem('2'), makeDvlaItem('3')];

      dynamoMock.on(ScanCommand).resolves({
        Items: items,
        LastEvaluatedKey: undefined,
      });

      dynamoMock
        .on(DeleteItemCommand)
        .resolvesOnce({})
        .rejectsOnce(new Error('DynamoDB Error'))
        .resolvesOnce({});

      await handler({ key: mockPurgeKey }, mockContext);

      const deleteCalls = dynamoMock.commandCalls(DeleteItemCommand);
      expect(deleteCalls).toHaveLength(3);
    });

    it('should throw when the scan fails', async () => {
      mockValidPurgeKey();

      dynamoMock.on(ScanCommand).rejects(new Error('DynamoDB Scan Error'));

      await expect(
        handler({ key: mockPurgeKey }, mockContext),
      ).rejects.toThrow('DynamoDB Scan Error');
    });
  });
});
