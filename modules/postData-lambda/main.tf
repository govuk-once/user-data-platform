locals {
  env     = "dev"
  project = "UDP"
  prefix  = "${local.project}-${local.env}"
}


resource "aws_lambda_function" "this" {
  filename         = data.archive_file.post_data_src.output_path
  function_name    = "${local.prefix}-postData"
  role             = aws_iam_role.lamdba_function_role.arn
  handler          = "postDataLambda.handler"
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

data "aws_iam_policy_document" "AWSLambdaTrustPolicyPostData" {
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
  name               = "terraform_function_postData_role"
  assume_role_policy = data.aws_iam_policy_document.AWSLambdaTrustPolicyPostData.json
}

resource "aws_iam_role_policy_attachment" "terraform_lambda_policy" {
  role       = aws_iam_role.lamdba_function_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "archive_file" "post_data_src" {
  source_file  = "../build/postDataLambda.js" // this is where the source is being built to
  output_path = "./postDataLambda.zip"
  type        = "zip"
} 