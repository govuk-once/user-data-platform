/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, beforeAll } from 'vitest';

import { App, Stack } from 'aws-cdk-lib';
import { Template, Match } from 'aws-cdk-lib/assertions';
import {
  MethodOptions,
  Model,
  RestApi,
  AuthorizationType,
  LambdaIntegration,
} from 'aws-cdk-lib/aws-apigateway';
import { Function, Code, Runtime } from 'aws-cdk-lib/aws-lambda';
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import z, { ZodObject } from 'zod';

import '../../zod/zod-kb';
import {
  bodyToApiGatewayModel,
  bodyToApiGatewayModelJson,
  applyModelRequestValidator,
} from './apiGatewayUtils';
import {
  badRequestResponseSchema,
  internalServerErrorResponseSchema,
} from '../defaults/errors';

extendZodWithOpenApi(z);

let id: string,
  app: App,
  stack: Stack,
  restApi: RestApi,
  body: ZodObject,
  model: Model,
  handler: Function,
  methodOptions: MethodOptions;

describe('apiGatewayUtils', () => {
  beforeAll(() => {
    id = 'Test';
    app = new App();
    stack = new Stack(app, `${id}Stack`);
    restApi = new RestApi(stack, `${id}Api`);
    body = routes.requestWithBody.body;

    // Create Lambda handler
    handler = new Function(stack, `${id}Handler`, {
      runtime: Runtime.NODEJS_24_X,
      handler: 'index.handler',
      code: Code.fromInline('exports.handler = async () => ({});'),
    });

    // Create ApiGateway Model
    model = bodyToApiGatewayModel(id, { restApi, body });

    // Create ApiGateway Model
    methodOptions = applyModelRequestValidator(stack, id, {
      restApi,
      methodOptions: { authorizationType: AuthorizationType.IAM },
      model,
    });

    // API must have at least one method
    const resource = restApi.root.addResource('test');
    resource.addMethod('POST', new LambdaIntegration(handler), methodOptions);
  });

  describe('bodyToApiGatewayModelJson', () => {
    it('trandforms JSONSchema to be used by apigateway.Model', () => {
      expect(bodyToApiGatewayModelJson(body)).toEqual(transformedSchema);
    });
  });

  describe('bodyToApiGatewayModel', () => {
    it('creates a ApiGateway Model with the expected JSON schema', () => {
      Template.fromStack(stack).hasResourceProperties(
        'AWS::ApiGateway::Model',
        {
          Name: 'TestModel',
          ContentType: 'application/json',
          Schema: Match.objectLike({
            type: 'object',
            $schema: 'http://json-schema.org/draft-04/schema#',
            properties: {
              string: { type: 'string', minLength: 1, maxLength: 100 },
              optional: { type: 'string' },
              number: { type: 'number', minimum: 1, maximum: 100 },
              boolean: { type: 'boolean' },
              object: { type: 'object' },
              payload: { type: 'string', maxLength: 400 },
              array: { type: 'array', minItems: 1, maxItems: 100 },
            },
            required: Match.arrayWith([
              'string',
              'number',
              'boolean',
              'object',
              'array',
            ]),
          }),
        },
      );
    });
  });

  describe('applyModelRequestValidator', () => {
    it('applies apigateway.RequestValidator to api method using apigateway.Method', () => {
      const template = Template.fromStack(stack);

      template.hasResourceProperties('AWS::ApiGateway::RequestValidator', {
        Name: 'TestRequestValidator',
        ValidateRequestBody: true,
      });

      template.hasResourceProperties('AWS::ApiGateway::Method', {
        HttpMethod: 'POST',
        RequestValidatorId: {
          Ref: Match.stringLikeRegexp('TestBodyValidator'),
        },
        RequestModels: {
          'application/json': {
            Ref: Match.stringLikeRegexp('TestApiTestModel'),
          },
        },
      });
    });
  });
});

const testFields = {
  string: z.string().min(1).max(100).openapi({
    description: 'This a string',
    example: 'abcd1234',
  }),
  optional: z.string().optional().openapi({
    description: 'This an optional string',
    example: 'abcd1234',
  }),
  number: z.number().min(1).max(100).openapi({
    description: 'This a string',
    example: 'abcd1234',
  }),
  boolean: z.boolean().openapi({
    description: 'This a boolean',
    example: true,
  }),
};

const bodySchema = z.object({
  ...testFields,
  object: z.object(testFields),
  payload: z.string().maxKB(400),
  array: z.array(z.object(testFields)).min(1).max(100),
});

const routes = {
  requestWithBody: {
    name: 'Test',
    dynamoDbActions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    identityTableActions: [
      'dynamodb:PutItem',
      'dynamodb:GetItem',
      'dynamodb:Query',
      'dynamodb:Scan',
    ],
    authorizationScopes: ['udp/write'],
    method: 'POST',
    path: '/v1/user',
    summary: 'Create User Record',
    description: 'Create User Record',
    tags: ['user'],
    body: bodySchema,
    successResponses: [
      {
        status: 204,
        description: 'No Content',
        schema: z.object({}).strict().required(),
      },
    ],
    errorResponses: [
      {
        status: 400,
        description: 'Bad Request',
        schema: badRequestResponseSchema,
      },
      {
        status: 500,
        description: 'Internal Server Error',
        schema: internalServerErrorResponseSchema,
      },
    ],
  },
};

const transformedSchema = {
  additionalProperties: false,
  properties: {
    array: {
      items: {
        additionalProperties: false,
        properties: {
          boolean: {
            type: 'boolean',
          },
          number: {
            maximum: 100,
            minimum: 1,
            type: 'number',
          },
          optional: {
            type: 'string',
          },
          string: {
            maxLength: 100,
            minLength: 1,
            type: 'string',
          },
        },
        required: ['string', 'number', 'boolean'],
        type: 'object',
      },
      maxItems: 100,
      minItems: 1,
      type: 'array',
    },
    boolean: {
      type: 'boolean',
    },
    number: {
      maximum: 100,
      minimum: 1,
      type: 'number',
    },
    object: {
      additionalProperties: false,
      properties: {
        boolean: {
          type: 'boolean',
        },
        number: {
          maximum: 100,
          minimum: 1,
          type: 'number',
        },
        optional: {
          type: 'string',
        },
        string: {
          maxLength: 100,
          minLength: 1,
          type: 'string',
        },
      },
      required: ['string', 'number', 'boolean'],
      type: 'object',
    },
    optional: {
      type: 'string',
    },
    payload: {
      maxLength: 400,
      type: 'string',
    },
    string: {
      maxLength: 100,
      minLength: 1,
      type: 'string',
    },
  },
  required: ['string', 'number', 'boolean', 'object', 'payload', 'array'],
  type: 'object',
};
