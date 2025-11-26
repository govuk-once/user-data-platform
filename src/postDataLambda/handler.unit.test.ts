import { describe, expect, it } from 'vitest';
import { handler } from './handler';
import { APIGatewayProxyEventV2 } from 'aws-lambda';

describe('postDataLambda', () => {
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

    const response = await handler(event);

    expect(response.status).toEqual(200);
    expect(response.body).toEqual('Hello POST data');
  });
});
