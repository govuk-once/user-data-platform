variable "getData_lambda_name" {
  type        = string
  description = "Function name of the get data lambda"
}

variable "getData_lambda_invoke_arn" {
  type        = string
  description = "Invoke Arn for the get Data lambda"
}

variable "postData_lambda_name" {
  type        = string
  description = "Function name of the post data lambda"
}

variable "postData_lambda_invoke_arn" {
  type        = string
  description = "Arn for the post Data lambda"
}

variable "env" {
  type        = string
  description = "the enviroment its running"
  default = "dev"
}