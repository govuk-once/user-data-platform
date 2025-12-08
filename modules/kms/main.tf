data "aws_caller_identity" "current" {}

locals {
  resource_prefix = var.name_prefix
}

resource "aws_kms_key" "this" {
  description             = "${local.resource_prefix}-${var.environment}"
  deletion_window_in_days = var.deletion_window_in_days
  enable_key_rotation     = var.enable_key_rotation

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Lambda Service"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action = [
          "kms:Descrypt",
          "kms:GenerateDataKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow Cloudwatch Logs"
        Effect = "Allow"
        Principal = {
          Service = "logs.eu-west-2.amazonaws.com"
        }
        Action = [
          "kms:Encrypt*",
          "kms:Decrypt*",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:Describe*"
        ]
        Resource = "*"
        Condition = {
          ArnLike = {
            "kms:EncryptionContext:aws:logs:arn" = "arn:aws:logs:eu-west-2:${data.aws_caller_identity.current.account_id}:*"
          }
        }
      }
    ]

  })

  tags = merge(var.tags, {
    Name        = "${local.resource_prefix}-${var.environment}-key"
    Environment = var.environment
  })
}

resource "aws_kms_alias" "this" {
  name          = "alias/${local.resource_prefix}-${var.environment}"
  target_key_id = aws_kms_key.this.key_id
}
