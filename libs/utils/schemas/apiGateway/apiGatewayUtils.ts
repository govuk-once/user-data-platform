import { Construct } from 'constructs';
import type { ZodObject } from 'zod';
import {
  Model,
  JsonSchemaType,
  type RestApi,
  ModelOptions,
  MethodOptions,
  RequestValidator,
} from 'aws-cdk-lib/aws-apigateway';

export function bodyToApiGatewayModelJson(
  body: ZodObject,
): Record<string, unknown> {
  const json = body.toJSONSchema({
    target: 'draft-04',
    reused: 'inline',
    cycles: 'throw',
  }) as Record<string, unknown>;

  delete json.$schema;
  delete json.default;

  return { type: JsonSchemaType.OBJECT, ...json };
}

export function bodyToApiGatewayModel(
  id: string,
  props: {
    restApi: RestApi;
    body: ZodObject;
  },
): Model {
  const modelName = `${id}Model`;
  const { restApi, body } = props;

  return new Model(restApi, modelName, {
    restApi,
    contentType: 'application/json',
    modelName,
    schema: { type: JsonSchemaType.OBJECT, ...bodyToApiGatewayModelJson(body) },
  });
}

export function applyModelRequestValidator(
  scope: Construct,
  id: string,
  props: {
    restApi: RestApi;
    methodOptions: MethodOptions;
    model: Model;
  },
): MethodOptions {
  const { restApi, methodOptions, model } = props;
  const bodyValidator = new RequestValidator(scope, `${id}BodyValidator`, {
    restApi,
    requestValidatorName: `${id}RequestValidator`,
    validateRequestBody: true,
  });

  return {
    ...methodOptions,
    requestValidator: bodyValidator,
    requestModels: {
      'application/json': model,
    },
  };
}
