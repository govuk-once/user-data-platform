variable "developer" {
  description = "Developer Prefix"
  type = string
  default = "" 
}

variable "environment" {
    description = "Enviroment name"
    type = string
    default = "dev"
}

variable "user_pool_name" {
  description = "Name of the user pool"
  type = string
  default = "UDP"
}

variable "use_remote_state" {
  description = "Use remote state flag"
  type = bool
  default = false 
}

variable "state_bucket" {
  description = "s3 bucket for shared terraform state"
  type = string
}

variable "domain_prefix" {
    description = "Domain prefix for hosted Ui"
    type = string
    default = "udp"
}

variable "resource_server_identifier" {
    description = "Identifier for the resource server"
    type = string
    default = "udp"
}

variable "resource_server_name" {
    description = "Name for the resource server"
    type = string
    default = "UDP"
}

variable "tags" {
  description = "Tags to apply to resources"
  type = map(string)
  default = {}
}
# may end up more granular eg "read:topics", "write:topics"
variable "resource_server_scopes" {
  description = "List of scopes for the resource server"
  type = list(object({
    name = string
    description= string
  }))
  default = [
    {
        name = "read"
        description = "Read access to api"
    },
    {
        name = "write"
        description = "Write access to api"
    }
  ]
}

variable "m2m_clients" {
    description = "Map of M2M client configurations"
    type = map(object({
        scopes = list(string)
        access_token_validity_minutes = number
    }))
    default = {
      flex:{
        scopes = ["udp/read", "udp/write"]
        access_token_validity_minutes = 5
      }
    }
}

variable "logging" {
    description = "Logging configuration for cognito"

    type = object({
      enabled = bool
      retention_days = number
      kms_key_arn = optional(string)
      advanced_security_mode = string #OFF, AUDIT or ENFORCED
    })
    default = {
        enabled = true
        retention_days = 30
        kms_key_arn = null
        advanced_security_mode = "AUDIT"
    }

    validation {
      condition = contains(["OFF", "AUDIT", "ENFORCED"], var.logging.advanced_security_mode)
      error_message = "advanced_security_mode must be one of OFF, AUDI, ENFORCED"
    }
}

variable "alarms" {
    description = "Coutwatch Alarms Configuration for cognito"
    type = object({
      enabled = bool
      notification_emails = list(string)
      throttling = object({
        threashold = number
        evaluation_periods = number
        period_seconds = number 
      })
    })

    default = {
      enabled = true
      notification_emails = []
      throttling = {
        threashold = 50
        evaluation_periods = 2
        period_seconds = 300
      }
    }
  
}