variable "environment" {
    description = "Enviroment name"
    type = string
}

variable "user_pool_name" {
  description = "Name of the user pool"
  type = string
}

variable "domain_prefix" {
    description = "Domain prefix for hosted Ui"
    type = string
}

variable "resource_server_identifier" {
    description = "Identifier for the resource server"
    type = string
}

variable "resource_server_name" {
    description = "Name for the resource server"
    type = string
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
        scope = list(string)
        access_token_validity_minutes = number
    }))
    default = {}
}