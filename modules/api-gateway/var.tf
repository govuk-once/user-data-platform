variable "env" {
  type        = string
  description = "the enviroment its running"
  default = "dev"
}

variable "use_remote_state" {
  type = bool
  description = "Flag to use the remote state"
  default = true
}

variable "state_bucket" {
  type = string
  description = "Bucket for remote terraform state"
}

variable "jwt_authorizer" {
  description = "JWT authorizer config for M2M authentication"
  type = object({
    enabled = bool
    issuer = string
    audience = list(string) 
  })
  default = {
    enabled = false
    issuer = ""
    audience = []
  }
}