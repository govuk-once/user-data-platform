locals {
  env     = "dev"
  project = "UDP"
  prefix  = "${local.project}-${local.env}"
}


resource "aws_lambda_function" "this" {
  filename         = data.archive_file.post_data_src.output_path
  function_name    = "${local.prefix}-postData"
  role             = data.aws_iam_role.postDataRole.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.post_data_src.output_base64sha256

  runtime = "nodejs${var.runtime_version}"

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

data "aws_iam_role" "postDataRole" {
  name = "AWSLambdaBasicExecutionRole"
}

data "archive_file" "post_data_src" {
  source_dir  = "./lambdabuilds"
  output_path = "./postDataLambda.zip"
  type        = "zip"
}