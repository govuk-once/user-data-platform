data "terraform_remote_state" "dynamodb" {
  count = var.use_remote_state ? 1 : 0

  backend = "s3"
  config = {
    bucket = var.state_bucket
    key = "udp/dynamodb/terraform.tfstate"
  }
}

data "terraform_remote_state" "api_gateway" {
  count = var.use_remote_state ? 1 : 0

  backend = "s3"
  config = {
    bucket = var.state_bucket
    key = "udp/api-gateway/terraform.tfstate"
  }
}

locals {
  dynamodb_table_name = var.use_remote_state ? data.terraform_remote_state.dynamodb[0].outputs.table_name : var.dynamodb_table_name
  dynamodb_table_arn =  var.use_remote_state ? data.terraform_remote_state.dynamodb[0].outputs.table_arn : var.dynamodb_table_arn

  api_gateway_id  = var.use_remote_state ? data.terraform_remote_state.api_gateway[0].outputs.api_id : var.api_gateway_id
  api_gateway_execution_arn  = var.use_remote_state ? data.terraform_remote_state.api_gateway[0].outputs.execution_arn : var.api_gateway_execution_arn
  api_gateway_authorizer_id  = var.use_remote_state ? data.terraform_remote_state.api_gateway[0].outputs.jwt_authorizer_id : var.api_gateway_authorizer_id
}

module "lambda" {
  source = "../lambda-base"

  function_name = "postDataLambda"
  handler = var.handler
  runtime = var.runtime
  source_path = var.source_path
  timeout = var.timeout
  memory_size = var.memory_size
  environment_variables = {
    DYNAMO_TABLE = local.dynamodb_table_name
  }
  environment = var.environment

  dynamodb_table_arn = local.dynamodb_table_arn
  dynamodb_actions = ["dynamodb:PutItem"]

  api_gateway_id = local.api_gateway_id
  api_gateway_execution_arn = local.api_gateway_execution_arn
  api_gateway_http_method = "POST"
  api_gateway_route_path = "/postData"
  api_gateway_authorizer_id = local.api_gateway_authorizer_id
  api_gateway_authorizsation_scopes = var.api_gateway_authorizsation_scopes
}