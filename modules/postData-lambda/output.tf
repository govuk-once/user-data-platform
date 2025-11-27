output "lambda_name" {
  description = "This is the name of the postData Lamdba function"
  value = aws_lambda_function.this.function_name
}

output "lambda_invoke_arn" {
  description = "This is the invoke_arn of the postData Lamdba function"
  value = aws_lambda_function.this.invoke_arn
}