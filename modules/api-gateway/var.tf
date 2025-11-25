variable "readingLambda" {
  type        = string
  description = "Funcation name of the lambda"
}

variable "env" {
  type        = string
  description = "the enviroment its running"
  default = "dev"
}