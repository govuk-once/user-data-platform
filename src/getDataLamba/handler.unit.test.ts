import { describe, expect, it } from 'vitest';
import { handler } from './handler';
import { APIGatewayProxyEvent } from 'aws-lambda';

describe('getDataLambda', () => {
  it('should return a status code of 200', async () => {
    const event: APIGatewayProxyEvent = {
      httpMethod: 'GET',
      headers: {},
      multiValueHeaders: {},
      queryStringParameters: null,
      multiValueQueryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      body: null,
      isBase64Encoded: false,
      path: '',
      resource: '',
    };

    const response = await handler(event);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual('Hello GET data');
  });
});
