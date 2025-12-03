variable "use_remote_state" {
  description = "Use remote state flag"
  type = bool
  default = false 
}

variable "state_bucket" {
  description = "s3 bucket for shared terraform state"
  type = string
}

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

variable "alarms" {
  description = "CloudWatch alarmas for WAF"
  type = object({
    enabled = bool
    notification_emails = list(string)

    blocked_requests = object({
      threshold = number
      evaluation_periods = number
      period_seconds = number
    })

    rate_limited_requests =  object({
      enabled = bool
      threshold = number
      evaluation_periods = number
      period_seconds = number
    })

    sql_injection_attempts =  object({
      enabled = bool
      threshold = number
      evaluation_periods = number
      period_seconds = number
    })

     high_request_count =  object({
      enabled = bool
      threshold = number
      evaluation_periods = number
      period_seconds = number
    })
  })
  default = {
   enabled = false
   notification_emails = []

   blocked_requests = {
     threshold = 100
     evaluation_periods = 1
     period_seconds = 300
   } 

   rate_limited_requests = {
     enabled = true
     threshold = 10
     evaluation_periods = 1
     period_seconds = 300
   }

   sql_injection_attempts = {
     enabled = true
     threshold = 5
     evaluation_periods = 1
     period_seconds = 300
   }

   high_request_count = {
     enabled = true
     threshold = 1000
     evaluation_periods = 2
     period_seconds = 300
   }
  }
  
  
}