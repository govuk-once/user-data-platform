import middy from '@middy/core';
import httpErrorHandler from '@middy/http-error-handler';
import jsonBodyParser from '@middy/http-json-body-parser';
import httpResponseSerializer from '@middy/http-response-serializer';
import type { APIGatewayProxyEventV2 } from 'aws-lambda';
import createError from 'http-errors';
import { ServiceFactory, IdentityInput } from '@libs/data-access';
import {
  createEnvValidator,
  zodValidator,
  getTracer,
  captureLambdaHandler,
  getLogger,
  injectLambdaContext,
  routes,
  CreateUserSchema,
} from '@libs/utils';
import { z } from 'zod';

const { middleware: envMiddleware, getEnv } = createEnvValidator({
  required: ['TABLE_NAME', 'IDENTITY_TABLE_NAME'],
  optional: { KMS_KEY_ID: undefined },
});

const { STACK: stack, SERVICE_NAME: serviceName = 'udpCreateUser' } =
  process.env;

const tracer = getTracer({ serviceName });
const logger = getLogger({
  serviceName,
  environment: stack,
});

let factory: ServiceFactory;

function getFactory() {
  if (!factory) {
    const { IDENTITY_TABLE_NAME, TABLE_NAME, KMS_KEY_ID } = getEnv();
    factory = new ServiceFactory({
      identityTableName: IDENTITY_TABLE_NAME,
      tableName: TABLE_NAME,
      kmsKeyId: KMS_KEY_ID,
      tracer,
    });
  }

  return factory;
}

type CreateUserBody = z.infer<typeof CreateUserSchema>;

export const lambdaHandler = async (event: APIGatewayProxyEventV2) => {
  try {
    const input = {
      ...(event.body as unknown as CreateUserBody),
    } as unknown as IdentityInput;

    const result = await getFactory()
      .getService('identity')
      .createAppUser(input);

    if (result.created) {
      return {
        statusCode: 201,
        body: {message: 'User Successfully Created'},
      };
    }

    return {
      statusCode: 200,
      body: {message: 'User already exists'},
    };
  } catch (error) {
    if (createError.isHttpError(error)) {
      throw error;
    }
    throw new createError.InternalServerError();
  }
};

export const handler = middy()
  .use(envMiddleware)
  .use(injectLambdaContext(logger))
  .use(captureLambdaHandler(tracer, { captureResponse: false }))
  .use({
    before: async () => {
      tracer.putAnnotation('stack', stack);
    },
  })
  .use(jsonBodyParser())
  .use(
    zodValidator({
      body: routes.createUser.body,
    }),
  )
  .use(httpErrorHandler())
  .use(
    httpResponseSerializer({
      serializers: [
        {
          regex: /^application\/json$/,
          serializer: ({ body }) => (body ? JSON.stringify(body) : null),
        },
      ],
      defaultContentType: 'application/json',
    }),
  )
  .handler(lambdaHandler);
