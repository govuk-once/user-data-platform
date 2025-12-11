output "function_name" {
  description = "This is the name of the deleteData Lamdba function"
  value       = module.lambda.function_name
}

output "lambda_invoke_arn" {
  description = "This is the invoke_arn of the deleteData Lamdba function"
  value       = module.lambda.invoke_arn
}
