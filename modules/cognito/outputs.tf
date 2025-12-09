output "user_pool_id" {
  description = "Id of the user pool"
  value       = aws_cognito_user_pool.main.id
}

output "user_pool_arn" {
  description = "ARN of user pool"
  value       = aws_cognito_user_pool.main.arn
}

output "user_pool_endpoint" {
  description = "Endpoint for the user pool"
  value       = aws_cognito_user_pool.main.endpoint
}

output "user_pool_domain" {
  description = "Domain for the user pool"
  value       = aws_cognito_user_pool_domain.main.domain
}

output "token_endpoint" {
  description = "OAuth2 token endpoint URL"
  value       = "https://${aws_cognito_user_pool_domain.main.domain}.auth.${data.aws_region.current.id}.amazoncognito.com/oauth2/token"
}

output "issuer_url" {
  description = "Issuer URL for JWT Validation"
  value       = "https://cognito-idp.${data.aws_region.current.id}.amazonaws.com/${aws_cognito_user_pool.main.id}"
}

output "resource_server_identifier" {
  description = "Identifier for resource server"
  value       = aws_cognito_resource_server.api.identifier
}


output "resource_server_scopes" {
  description = "Scopes defined on the resource server"
  value       = aws_cognito_resource_server.api.scope[*].scope_name
}

output "m2m_client_ids" {
  description = "Map of M2M client names to client ids"
  value       = { for K, V in aws_cognito_user_pool_client.m2m : K => V.id }
}

output "m2m_client_secrets" {
  description = "Map of M2M client names to client secrets"
  value       = { for K, V in aws_cognito_user_pool_client.m2m : K => V.client_secret }
  sensitive   = true
}

output "jwt_audiences" {
  description = "Valid audiences for the JWT validations (client M2M tokens)"
  value       = [for K, V in aws_cognito_user_pool_client.m2m : V.id]
}
