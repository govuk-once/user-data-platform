data "archive_file" "get_data_src" {
  type        = "zip"
  source_file = "../../build/${var.function_name}.js" // this is where the source is being built to
  output_path = "../../build/${var.function_name}.zip"
}

resource "aws_lambda_function" "this" {
  filename         = data.archive_file.get_data_src.output_path
  function_name    = "${var.function_name}-${var.environment}"
  role             = aws_iam_role.lambda.arn
  handler          = var.handler
  source_code_hash = data.archive_file.get_data_src.output_base64sha256
  runtime          = var.runtime
  timeout          = var.timeout
  memory_size      = var.memory_size

  kms_key_arn = var.kms_key_arn

  environment {
    variables = var.environment_variables
  }

  tags = merge(var.tags, {
    Name        = "${var.function_name}-${var.environment}"
    Environment = var.environment
  })

}


resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.this.function_name}"
  retention_in_days = var.log_retention_days

  kms_key_id = var.cloudwatch_logs_kms_key_arn

  tags = merge(var.tags, {
    Name        = "${var.function_name}-${var.environment}-logs"
    Environment = var.environment
  })
}

# IAM Role

data "aws_iam_policy_document" "lambda_assume_role" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda" {
  name               = "${var.function_name}-${var.environment}-role"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume_role.json

  tags = merge(var.tags, {
    role       = "${var.function_name}-${var.environment}-role"
    policy_arn = "arn:aws::iam:policy/service-role/AWSLambdaBasicExcecutionRole"
  })
}

# KMS access
data "aws_iam_policy_document" "kms_access" {
  count = var.kms_key_arn != null ? 1 : 0

  statement {
    actions = [
      "kms:Decrypt",
      "kms:GenerateDataKey"
    ]
    resources = [var.kms_key_arn]
  }
}

resource "aws_iam_role_policy" "kms_access" {
  count = var.kms_key_arn != null ? 1 : 0

  name   = "${var.function_name}-kms-access"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.kms_access[0].json
}

data "aws_iam_policy_document" "dynamodb_access" {
  count = var.dynamodb_table_arn != null ? 1 : 0

  statement {
    actions   = var.dynamodb_actions
    resources = [var.dynamodb_table_arn]
  }
}

resource "aws_iam_role_policy" "dynamodb_access" {
  count  = var.dynamodb_table_arn != null ? 1 : 0
  name   = "${var.function_name}-dynamodb-access"
  role   = aws_iam_role.lambda.id
  policy = data.aws_iam_policy_document.dynamodb_access[0].json
}


# API GATEWAY integraton
resource "aws_apigatewayv2_integration" "this" {
  count = var.api_gateway_id != "" ? 1 : 0

  api_id               = var.api_gateway_id
  integration_type     = "AWS_PROXY"
  integration_uri      = aws_lambda_function.this.invoke_arn
  integration_method   = "POST"
  passthrough_behavior = "WHEN_NO_MATCH"

}

resource "aws_apigatewayv2_route" "this" {
  count = var.api_gateway_id != "" ? 1 : 0

  api_id    = var.api_gateway_id
  route_key = var.api_gateway_catch_all ? "${upper(var.api_gateway_http_method)} /{proxy+}" : "${upper(var.api_gateway_http_method)} ${var.api_gateway_route_path}"

  target = "integrations/${aws_apigatewayv2_integration.this[0].id}"

  authorization_type   = var.api_gateway_authorizer_id != "" ? "JWT" : "NONE"
  authorizer_id        = var.api_gateway_authorizer_id != "" ? var.api_gateway_authorizer_id : null
  authorization_scopes = var.api_gateway_authorizer_id != "" ? var.api_gateway_authorizsation_scopes : null
}

resource "aws_lambda_permission" "api_gateway" {
  count = var.api_gateway_id != "" ? 1 : 0

  statement_id  = "AllowAPIGatewayV2Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.this.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${var.api_gateway_execution_arn}/*/*"
}
