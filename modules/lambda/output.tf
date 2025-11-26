output "getData_lambda_name" {
  description = "This is the name of the getData Lamdba function"
  value = aws_lambda_function.this.function_name
}

output "getData_lambda_arn" {
  description = "This is the name of the getData Lamdba function"
  value = aws_lambda_function.this.arn
}