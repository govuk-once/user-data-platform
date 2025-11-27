resource "aws_dynamodb_table" "this" {
    name = "${var.table_name}-${var.environment}"
    billing_mode = "PAY_PER_REQUEST"
    hash_key = var.hash_key
    range_key = var.sort_key

    attribute {
      name = var.hash_key
      type = "S"
    }

    attribute {
      name = var.sort_key
      type ="S"
    }

    server_side_encryption {
      enabled = var.enable_encription
      kms_key_arn = var.kms_key_arn
    }

    point_in_time_recovery {
      enabled = var.point_in_time_recovery_enabled
    }

    tags = merge(var.tags, {
      name = "${var.table_name}=${var.environment}"
      environment = var.environment
    })
}