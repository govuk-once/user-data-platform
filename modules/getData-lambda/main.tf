locals {
  env     = "dev"
  project = "UDP"
  prefix  = "${local.project}-${local.env}"
}

resource "aws_lambda_function" "this" {
  filename         = data.archive_file.src.output_path
  function_name    = "${local.prefix}-getData"
  role             = aws_iam_role.lamdba_function_role.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.src.output_base64sha256

    runtime = "nodejs${var.runtime_version}"

  environment {
    variables = {
      ENVIRONMENT = "dev"
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

data "aws_iam_policy_document" "AWSLambdaTrustPolicyGetData" {
  statement {
    actions    = ["sts:AssumeRole"]
    effect     = "Allow"
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lamdba_function_role" {
  name               = "terraform_function_getData_role"
  assume_role_policy = data.aws_iam_policy_document.AWSLambdaTrustPolicyGetData.json
}

resource "aws_iam_role_policy_attachment" "terraform_lambda_policy" {
  role       = aws_iam_role.lamdba_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "src" {
  source_dir  = "./lambdabuilds"
  output_path = "./getDataLambda.zip"
  type        = "zip"
}