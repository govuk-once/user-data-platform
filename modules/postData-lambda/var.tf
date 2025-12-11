variable "developer" {
  description = "Developer Prefix"
  type        = string
  default     = ""
}

variable "state_bucket" {
  description = "Bucket for terraform remote state"
  type        = string
}

variable "handler" {
  description = "Lamda handler"
  type        = string
  default     = "index.handler"
}

variable "runtime" {
  description = "Lambda runtime"
  type        = string
  default     = "nodejs20.x"
}

variable "source_path" {
  description = "Path to lambda source code zip"
  type        = string
}

variable "timeout" {
  description = "Lambda timeout in seconds"
  type        = number
  default     = 30
}

variable "memory_size" {
  description = "Lambda memory size in MB"
  type        = number
  default     = 250
}

variable "environment_variables" {
  description = "Environment variables for the lambda"
  type        = map(string)
  default     = {}
}

variable "environment" {
  type        = string
  description = "the enviroment its running"
  default     = "dev"
}

variable "use_remote_state" {
  description = "Flag use remote state"
  type        = bool
  default     = false
}

variable "dynamodb_table_name" {
  description = "Dynamo Table Name"
  type        = string
}

variable "dynamodb_table_arn" {
  description = "Dynamo Table Name"
  type        = string
}

variable "api_gateway_id" {
  description = "Api Gateway ID"
  type        = string
}

variable "api_gateway_execution_arn" {
  description = "Api Gateway ARN"
  type        = string
}

variable "api_gateway_authorizer_id" {
  description = "Api Gateway Authorizer ID"
  type        = string
}

variable "api_gateway_authorizsation_scopes" {
  description = "OAuth2 scopes required to access this route"
  type        = list(string)
  default     = ["udp/write"]
}
