//WAF, API Gateway, IAM WAF -> API?.
locals {
  env     = "dev"
  project = "UDP"
  prefix  = "${local.project}-${local.env}"
}

resource "aws_apigatewayv2_api" "this" {
  name          = "${local.prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_stage" "this" {
  api_id = aws_apigatewayv2_api.this.id
  name   = "default-stage"
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format          = "{ 'requestId':'$context.requestId', 'extendedRequestId':'$context.extendedRequestId','ip': '$context.identity.sourceIp', 'caller':'$context.identity.caller', 'user':'$context.identity.user', 'requestTime':'$context.requestTime', 'httpMethod':'$context.httpMethod', 'resourcePath':'$context.resourcePath', 'status':'$context.status', 'protocol':'$context.protocol', 'responseLength':'$context.responseLength' }"
  }
}

resource "aws_cloudwatch_log_group" "access" {
  name_prefix       = "${local.prefix}-access"
  retention_in_days = 1
}

resource "aws_lambda_function" "example" {
  filename      = "example.zip"
  function_name = "Example"
  role          = aws_iam_role.example.arn
  handler       = "index.handler"
  runtime       = "nodejs22.x"
}

resource "aws_apigatewayv2_integration" "this" {
  api_id               = aws_apigatewayv2_api.this.id
  integration_type     = "AWS_PROXY"
  description          = "UDP Updater"
  integration_method   = "GET"
  integration_uri      = aws_lambda_function.example.invoke_arn
  passthrough_behavior = "WHEN_NO_MATCH"
}

data "aws_lambda_function" "this" {
  function_name = var.readingLambda
}