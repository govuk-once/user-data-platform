# ---
# Cognito User pool
# ----
resource "aws_cognito_user_pool" "main" {
    name = "${var.user_pool_name}-${var.environment}"

    admin_create_user_config {
      allow_admin_create_user_only = true
    }

    password_policy {
      minimum_length = 12
      require_lowercase = true
      require_numbers = true
      require_symbols = true
      require_uppercase = true
      temporary_password_validity_days = 7
    }

    account_recovery_setting {
      recovery_mechanism {
        name = "admin_only"
        priority = 1
      }
    }

    tags = merge(var.tags, {
        name = "${var.user_pool_name}-${var.environment}"
        environment = var.environment
    })

}
# ---
# User pool domain
# ----
resource "aws_cognito_user_pool_domain" "main" {
    domain = "${var.domain_prefix}-${var.environment}"
    user_pool_id = aws_cognito_user_pool.main.id
  
}
# ---
# Resource server
# ----
resource "aws_cognito_resource_server" "api" {
    identifier = var.resource_server_identifier
    name = "${var.resource_server_name}-${var.environment}"
    user_pool_id = aws_cognito_user_pool.main.id  

    dynamic "scope" {
      for_each = var.resource_server_scopes
      content {
        scope_name = scope.value.name
         scope_description = scope.value.description
      }
    }
}


# ---
# M2M App CLient
# ----
resource "aws_cognito_user_pool_client" "m2m" {
    for_each = var.m2m_clients

    name = "${each.key}-${ar.environment}"
    user_pool_id = aws_cognito_user_pool.main.id

    generate_secret = true

    allowed_oauth_flows = ["client_credentials"]
    allowed_oauth_flows_user_pool_client = true
    allowed_oauth_scopes = each.value.scopes

    access_token_validity = each.value.access_token_validity_minutes
    token_validity_units {
      access_token = "minutes"
    }

    explicit_auth_flows = []

    supported_identity_providers = []

    prevent_user_existence_errors = "ENABLED"

    depends_on = [ aws_cognito_resource_server.api ]
}