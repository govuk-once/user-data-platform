//WAF, API Gateway, IAM WAF -> API?.
data "terraform_remote_state" "cognito" {
  count = var.use_remote_state ? 1 : 0
  backend = "s3"
  config = {
    bucket = var.state_bucket
    key = "${var.developer}/dev/cognito/terraform.tfstate"
    region = "eu-west-2"
  }
}


locals {
  env     = "dev"
  project = "UDP"
  prefix  = "${var.developer != "" ? "${var.developer}-" : ""}${local.project}-${local.env}"
  jwt_issuer = var.use_remote_state ? data.terraform_remote_state.cognito[0].outputs.issuer_url : var.jwt_authorizer.issuer
  jwt_audience = var.use_remote_state ? data.terraform_remote_state.cognito[0].outputs.jwt_audiences : var.jwt_authorizer.audience
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

# -----
# JWT authorizer
# ----

resource "aws_apigatewayv2_authorizer" "jwt" {
  count = var.jwt_authorizer.enabled ?  1 : 0

  api_id = aws_apigatewayv2_api.this.id
  authorizer_type = "JWT"
  identity_sources = ["$request.header.Authorization"]
  name = "${local.prefix}-api-jst-authorizer-${local.env}"
  
  jwt_configuration {
    audience = local.jwt_audience
    issuer = local.jwt_issuer
  }
}
