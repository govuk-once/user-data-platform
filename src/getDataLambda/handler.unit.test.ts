import { describe, expect, it } from 'vitest';
import { handler } from './handler';
import {  APIGatewayProxyEventV2, Context } from 'aws-lambda';

const context: Context = {
  callbackWaitsForEmptyEventLoop: true,
  functionName: 'getDataLambda',
  functionVersion: '1',
  invokedFunctionArn: 'arn:',
  memoryLimitInMB: '1128MB',
  awsRequestId: 'test',
  logGroupName: 'aws/lambda/getDataLambda',
  logStreamName:'test',
  getRemainingTimeInMillis: () => 5000,
  done: () => {},
  fail: () => {},
  succeed: () => {}
}

describe('getDataLambda', () => {
  it('should return a status code of 200', async () => {
    const event: APIGatewayProxyEventV2 = {
      headers: {},
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: '',
      rawQueryString: '',
      version: '0.1',
      routeKey: '',
    };

    const response = await handler(event, context);

    expect(response.statusCode).toEqual(200);
    expect(response.body).toEqual('Hello GET data');
  });

  it("should return a Bad Request http error with a status code of 400", async ()=> {
    const event: APIGatewayProxyEventV2 = {
      headers: {},
      requestContext: {} as any,
      isBase64Encoded: false,
      rawPath: 'error',
      rawQueryString: '',
      version: '0.1',
      routeKey: '',
    };

    const response = await handler(event,context);

    expect(response.statusCode).toEqual(400);
    expect(response.body).toEqual('Bad Request');
  })
});
