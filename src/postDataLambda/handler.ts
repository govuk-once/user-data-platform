<<<<<<< HEAD
import type { APIGatewayProxyEvent } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEvent) => {
=======
import type { APIGatewayProxyEventV2 } from 'aws-lambda';

export const handler = async (event: APIGatewayProxyEventV2) => {
>>>>>>> main
  return {
    status: 200,
    body: 'Hello POST data',
  };
};
