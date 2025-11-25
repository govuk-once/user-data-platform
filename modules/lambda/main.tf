locals {
  env     = "dev"
  project = "UDP"
  prefix  = "${local.project}-${local.env}"
}


resource "aws_lambda_function" "this" {
  filename         = data.archive_file.src.output_path
  function_name    = "${prefix}-getData"
  role             = data.aws_iam_role.this.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.src.output_base64sha256

  runtime = "nodejs22.x"

  environment {
    variables = {
      ENVIRONMENT = "production"
      LOG_LEVEL   = "info"
    }
  }
}

data "aws_iam_policy_document" "assume_role" {
  statement {
    effect = "Allow"

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    actions = ["sts:AssumeRole"]
  }
}

data "aws_iam_role" "this" {
  name = "AWSLambdaBasicExecutionRole"
}

data "archive_file" "src" {
  source_dir = "../build"
  output_path = "./lambdabuilds/getDataLambda.zip"
  type = "zip"
}