provider "aws" {
  region = "eu-west-2"
}

module "get_data_lambda" {
  source = "./getData-lambda"
}

module "post_data_lambda" {
  source = "./postData-lambda"
}

module "aws_apigatewayv2_api" {
  source                     = "./api-gateway/"
  getData_lambda_name        = module.get_data_lambda.lambda_name
  getData_lambda_invoke_arn  = module.get_data_lambda.lambda_invoke_arn
  postData_lambda_name       = module.post_data_lambda.lambda_name
  postData_lambda_invoke_arn = module.post_data_lambda.lambda_invoke_arn
}