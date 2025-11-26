variable "env" {
  type        = string
  description = "the enviroment its running"
  default     = "dev"
}

variable "runtime_version" {
  type        = string
  description = "Node runtime version"
  default     = "22.x"
}