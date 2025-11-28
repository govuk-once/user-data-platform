variable "name_prefix" {
  description = "Prefix for WAF resource names"
  type = string
}

variable "environment" {
    description = "Environment name"
    type = string
}

variable "api_gateway_stage_arn" {
  description = "ARN of the API Gateway V2"
  type = string
}

variable "tags" {
  description = "Tags to apply to WAF resource"
  type = map(string)
  default = {}
}

variable "rate_limiting" {
  description = "Rate limiting Configuration"
  type = object({
    enabled = bool
    limit = number #requests per 5-minute period per IP 
  })
  default = {
    enabled = true
    limit = 200
  }
}

variable "managed_rules" {
  description = "AWS Managed Rules configuration"
  type = object({
    sql_injection = object({
      enabled = bool
      action = string # "block" or "count"
    })
    common = object({
      enabled = bool
      action = string # "block" or "count"
    })
  })
  default = {
    sql_injection = {
      enabled = true
      action = "block" 
    }
    common = {
      enabled = true
      action = "block" 
    }
  }
}

variable "logging" {
  description = "WAF logging configuration"
  type = object({
    enabled = bool
    retention_days = number
    redact_authorization = bool 
  })
  default = {
    enabled = true
    retention_days = 30
    redact_authorization = true
  }
}