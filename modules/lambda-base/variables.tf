variable "function_name" {
    description = "Name of lambda function"
    type = string
}

variable "handler" {
    description = "Lamda handler"
    type = string
    default = "index.handler"
}

variable "runtime" {
    description = "Lambda runtime"
    type = string
    default = "nodejs20.x"
}

variable "source_path" {
  description = "Path to lambda source code zip"
  type = string
}

variable "timeout" {
    description = "Lambda timeout in seconds"
    type = number 
    default = 30
}

variable "memory_size" {
    description = "Lambda memory size in MB"
    type = number
    default = 250
}

variable "environment_variables" {
    description = "Environment variables for the lambda"
    type = map(string)
    default = {} 
}

variable "environment" {
    description = "Environment Name"
    type = string

}

variable "tags" {
    description = "Taggs to apply to the resource"
    type = map(string)
    default = {} 
}

variable "log_retention_days" {
    description = "Number of days to retain the logs"
    type = number
    default = 14
}

variable "dynamodb_table_arn" {
    description = "ARN of the synamo table for IAM"
    type = string
    default = null
}

variable "dynamodb_actions" {
    description = "DynamoDb actions to allow"
    type = list(string)
    default = [ "dynamodb:GetItem", "dynamodb:Query" , "dynamodb:Scan" ]
}

variable "api_gateway_id" {
    description = "Id of the api gateway for integrration"
    type = string
    default = "" 
}

variable "api_gateway_execution_arn" {
  description = "Api Gateway Execution ARN"
  type = string
  default = ""
}

variable "api_gateway_http_method" {
    description = "HTTP method for the API gateway"
    type = string
    default = "GET"
}

variable "api_gateway_route_path" {
  description = "Route Path for the API Gateway"
  type = string
  default = "/"
}

variable "kms_key_arn" {
    description = "ARN of the KMS key for lambda environment variables"
    type = string
    default = null
}

variable "cloudwatch_logs_kms_key_arn" {
    description = "ARN of the KMS key for cloudwatch logs"
    type = string
    default = null
}

variable "api_gateway_authorizer_id" {
  description = "API Gateway JWT authorizer"
  type = string
  default = ""
}

variable "api_gateway_authorizsation_scopes" {
    description = "OAuth2 scopes required to access this route"
    type = list(string)
    default = []
}
