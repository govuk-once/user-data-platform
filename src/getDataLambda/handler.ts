import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors'

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {

  if(event.rawPath === 'error') {
    throw new createError.BadRequest()
  }

  return {
    statusCode: 200,
    body: 'Hello GET data',
  };
};


export const handler = middy().use(httpErrorHandler()).handler(lambdaHandler)