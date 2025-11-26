import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEventV2) => {
  return {
    status: 200,
    body: 'Hello POST data',
  };
};
