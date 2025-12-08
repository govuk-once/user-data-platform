output "function_name" {
  description = "Name of the lambda function"
  value       = aws_lambda_function.this.function_name
}

output "function_arn" {
  description = "The ARN of the lambda function"
  value       = aws_lambda_function.this.arn
}

output "invoke_arn" {
  description = "The Invoke ARN of the lambda function"
  value       = aws_lambda_function.this.invoke_arn
}

output "role_arn" {
  description = "ARN of IAM Role"
  value       = aws_iam_role.lambda.arn
}

output "role_name" {
  description = "Name of IAM Role"
  value       = aws_iam_role.lambda.name
}

output "api_gateway_integration_id" {
  description = "ID of the api gateway integration"
  value       = var.api_gateway_id != "" ? aws_apigatewayv2_integration.this[0].id : null
}

output "api_gateway_route_id" {
  description = "Id of the api gateway route"
  value       = var.api_gateway_id != "" ? aws_apigatewayv2_route.this[0].id : null
}

output "kms_key_an" {
  description = "ARN of the KMS key used for lambda environment variable encryption"
  value       = var.kms_key_arn
}

output "cloudwatch_logs_kms_key_arn" {
  description = "ARM of the KMS key used for Cloudwatch logs encryption"
  value       = var.cloudwatch_logs_kms_key_arn
}
