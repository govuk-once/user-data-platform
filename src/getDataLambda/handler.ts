import type { APIGatewayProxyEvent } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent) => {
  return {
    status: 200,
    body: 'Hello GET data',
  };
};
