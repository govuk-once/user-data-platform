variable "developer" {
  description = "Developer Prefix"
  type        = string
  default     = ""
}

variable "name_prefix" {
  description = "Name Prefix for the resource"
  type        = string
  default = "UDP"
}

variable "environment" {
  description = "Enviroment name"
  type        = string
  default = "development"
}

variable "enable_key_rotation" {
  description = "Enable automatic key rotation"
  type        = bool
  default = true
}

variable "deletion_window_in_days" {
  description = "Duration in days after which the key is deleted after destruction"
  type        = number
  default     = 30
}

variable "tags" {
  description = "Tags to apply to resource"
  type        = map(string)
  default     = {}
}
