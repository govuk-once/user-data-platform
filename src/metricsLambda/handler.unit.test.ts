/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context } from 'aws-lambda';
import { handler } from './handler';

import { DynamoDBDocumentClient, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';

vi.hoisted(() => {
  process.env['IDENTITY_TABLE_NAME'] = 'identity-table';
});

const dynamoMock = mockClient(DynamoDBDocumentClient);

describe('metricsLambda handler', () => {
  const mockContext: Context = {
    callbackWaitsForEmptyEventLoop: true,
    functionName: 'metricsLambda',
    functionVersion: '1',
    invokedFunctionArn:
      'arn:aws:lambda:us-east-1:123456789012:function:metricsLambda',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/metricsLambda',
    logStreamName: 'test-stream',
    getRemainingTimeInMillis: () => 5000,
    done: () => {},
    fail: () => {},
    succeed: () => {},
  };

  beforeEach(() => {
    dynamoMock.reset();
  });

  it('should return distinct service name counts from identity table', async () => {
    dynamoMock.on(ScanCommand).resolves({
      Items: [
        { pk: 'dvla#user1' },
        { pk: 'dvla#user2' },
        { pk: 'dvla#user3' },
        { pk: 'app#user1' },
        { pk: 'app#user2' },
        { pk: 'hmrc#user1' },
      ],
    });

    const response = (await handler({} as any, mockContext)) as any;
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.totalRecords).toBe(6);
    expect(body.distinctLinkTypes).toBe(3);
    expect(body.linkTypes).toEqual([
      { serviceName: 'dvla', count: 3 },
      { serviceName: 'app', count: 2 },
      { serviceName: 'hmrc', count: 1 },
    ]);
  });

  it('should handle paginated scan results', async () => {
    dynamoMock
      .on(ScanCommand)
      .resolvesOnce({
        Items: [{ pk: 'dvla#user1' }, { pk: 'dvla#user2' }],
        LastEvaluatedKey: { pk: 'dvla#user2' },
      })
      .resolvesOnce({
        Items: [{ pk: 'dvla#user3' }, { pk: 'app#user1' }],
      });

    const response = (await handler({} as any, mockContext)) as any;
    const body = JSON.parse(response.body);

    expect(body.totalRecords).toBe(4);
    expect(body.linkTypes).toEqual([
      { serviceName: 'dvla', count: 3 },
      { serviceName: 'app', count: 1 },
    ]);
    expect(dynamoMock.commandCalls(ScanCommand).length).toBe(2);
  });

  it('should return empty results for an empty table', async () => {
    dynamoMock.on(ScanCommand).resolves({ Items: [] });

    const response = (await handler({} as any, mockContext)) as any;
    const body = JSON.parse(response.body);

    expect(response.statusCode).toBe(200);
    expect(body.totalRecords).toBe(0);
    expect(body.distinctLinkTypes).toBe(0);
    expect(body.linkTypes).toEqual([]);
  });

  it('should handle pk values without a hash separator', async () => {
    dynamoMock.on(ScanCommand).resolves({
      Items: [{ pk: 'malformed-pk' }, { pk: 'dvla#user1' }],
    });

    const response = (await handler({} as any, mockContext)) as any;
    const body = JSON.parse(response.body);

    expect(body.totalRecords).toBe(2);
    expect(body.linkTypes).toEqual(
      expect.arrayContaining([
        { serviceName: 'dvla', count: 1 },
        { serviceName: 'malformed-pk', count: 1 },
      ]),
    );
  });

  it('should use ProjectionExpression to only fetch pk', async () => {
    dynamoMock.on(ScanCommand).resolves({ Items: [] });

    await handler({} as any, mockContext);

    const call = dynamoMock.commandCalls(ScanCommand)[0].args[0].input;
    expect(call.ProjectionExpression).toBe('pk');
    expect(call.TableName).toBe('identity-table');
  });
});
