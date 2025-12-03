output "api_id" {
  description = "The API Gateway ID"
  value = aws_apigatewayv2_api.this.id
}

output "api_arn" {
  description = "The API Endpoint invoke url"
  value = aws_apigatewayv2_api.this.arn
}

output "execution_arn" {
  description = "The API Endpoint invoke url"
  value = aws_apigatewayv2_api.this.execution_arn
}

output "jwt_authorizer_id" {
  description = "The API Endpoint invoke url"
  value = var.jwt_authorizer.enabled ? aws_apigatewayv2_authorizer.jwt[0].id : null
}

output "api_endpoint" {
  description = "The API Endpoint invoke url"
  value = aws_apigatewayv2_stage.this.invoke_url
}

output "stage_arn" {
  description = "The Stage ARN for the gateway for WAF association"
  value = aws_apigatewayv2_stage.this.arn
}
