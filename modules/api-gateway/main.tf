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
  auto_deploy = true
  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.access.arn
    format          = "{ 'requestId':'$context.requestId', 'extendedRequestId':'$context.extendedRequestId','ip': '$context.identity.sourceIp', 'caller':'$context.identity.caller', 'user':'$context.identity.user', 'requestTime':'$context.requestTime', 'httpMethod':'$context.httpMethod', 'resourcePath':'$context.resourcePath', 'status':'$context.status', 'protocol':'$context.protocol', 'responseLength':'$context.responseLength' }"
  }
}

resource "aws_cloudwatch_log_group" "access" {
  name_prefix       = "${local.prefix}-access"
  retention_in_days = 1
}

resource "aws_apigatewayv2_integration" "getData" {
  api_id               = aws_apigatewayv2_api.this.id
  integration_type     = "AWS_PROXY"
  description          = "UDP get data"
  integration_method   = "POST"
  integration_uri      = var.getData_lambda_invoke_arn
  passthrough_behavior = "WHEN_NO_MATCH"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "getDataRoute" {
  api_id = aws_apigatewayv2_api.this.id
  route_key = "GET /getData"
  target = "integrations/${aws_apigatewayv2_integration.getData.id}"
}

resource "aws_apigatewayv2_integration" "postData" {
  api_id               = aws_apigatewayv2_api.this.id
  integration_type     = "AWS_PROXY"
  description          = "UDP post data"
  integration_method   = "POST"
  integration_uri      = var.postData_lambda_invoke_arn
  passthrough_behavior = "WHEN_NO_MATCH"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "postDataRoute" {
  api_id = aws_apigatewayv2_api.this.id
  route_key = "POST /postData"
  target = "integrations/${aws_apigatewayv2_integration.postData.id}"
}

resource "aws_lambda_permission" "lambda_permission_getData" {
  statement_id  = "AllowMyDemoAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.getData_lambda_name
  principal     = "apigateway.amazonaws.com"

  # The /* part allows invocation from any stage, method and resource path
  # within API Gateway.
  source_arn = "${aws_apigatewayv2_api.this.arn}/*"
} 

resource "aws_lambda_permission" "lambda_permission_postData" {
  statement_id  = "AllowMyDemoAPIInvoke"
  action        = "lambda:InvokeFunction"
  function_name = var.postData_lambda_name
  principal     = "apigateway.amazonaws.com"

  # The /* part allows invocation from any stage, method and resource path
  # within API Gateway.
  source_arn = "${aws_apigatewayv2_api.this.arn}/*"
} 
