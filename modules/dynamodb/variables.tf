variable "developer" {
  description = "Developer Prefix"
  type        = string
  default     = ""
}

variable "use_remote_state" {
  description = "Use remote state flag"
  type        = bool
  default     = false
}

variable "state_bucket" {
  description = "s3 bucket for shared terraform state"
  type        = string
}

variable "table_name" {
  description = "Name of DynamoDB Table"
  type        = string
}

variable "hash_key" {
  description = "Hash key for the DynamoDB Table"
  type        = string
  default     = "pk"
}

variable "sort_key" {
  description = "Sort key for DynamoDB Table"
  type        = string
  default     = "sk"
}

variable "environment" {
  description = "Environment Name"
  type        = string
}

variable "enable_encryption" {
  description = "Enable server-side encryption with aws KMS key"
  type        = bool
  default     = true
}

variable "kms_key_arn" {
  description = "ARN of the KMS key for encryption if not provided, AWS managed key will be used"
  type        = string
  default     = null
}

variable "point_in_time_recovery_enabled" {
  description = "Enable point-in-time recovery for the table"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "alarms" {
  description = "Cloudwatch alarms configuration for DynamoDB"
  type = object({
    enabled             = bool,
    notification_emails = list(string)

    threshold_requests = object({
      threshold          = number
      evaluation_periods = number
      period_seconds     = number
    })

    read_capacity = object({
      enabled            = bool
      threshold          = number
      evaluation_periods = number
      period_seconds     = number
    })

    write_capacity = object({
      enabled            = bool
      threshold          = number
      evaluation_periods = number
      period_seconds     = number
    })
  })
  default = {
    enabled             = false
    notification_emails = []

    threshold_requests = {
      threshold          = 1
      evaluation_periods = 1
      period_seconds     = 60
    }

    read_capacity = {
      enabled            = false
      threshold          = 80
      evaluation_periods = 2
      period_seconds     = 300
    }

    write_capacity = {
      enabled            = false
      threshold          = 80
      evaluation_periods = 2
      period_seconds     = 300
    }
  }
}
