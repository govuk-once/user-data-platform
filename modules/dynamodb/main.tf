locals {
  prefix = "${var.developer != "" ? "${var.developer}-" : ""}dynamodb-${var.environment}"
}

resource "aws_dynamodb_table" "this" {
  name         = "${local.prefix}-${var.table_name}"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = var.hash_key
  range_key    = var.sort_key

  attribute {
    name = var.hash_key
    type = "S"
  }

  attribute {
    name = var.sort_key
    type = "S"
  }

  server_side_encryption {
    enabled     = var.enable_encryption
    kms_key_arn = var.kms_key_arn
  }

  point_in_time_recovery {
    enabled = var.point_in_time_recovery_enabled
  }

  tags = merge(var.tags, {
    name        = "${local.prefix}-${var.table_name}"
    environment = var.environment
  })
}



#--------------------
# SNS topic for alarms
# -----------------------

resource "aws_sns_topic" "dynamodb_alarms" {
  count = var.alarms.enabled ? 1 : 0

  name = "${local.prefix}-${var.table_name}-dynamodb-alarms"

  tags = merge(var.tags, {
    Name        = "${local.prefix}-${var.table_name}-dynamodb-alarms"
    Environment = var.environment
  })

}

resource "aws_sns_topic_subscription" "dynamo_alarm_emails" {
  for_each = var.alarms.enabled ? toset(var.alarms.notification_emails) : toset([])

  topic_arn = aws_sns_topic.dynamodb_alarms[0].arn
  protocol  = "email"
  endpoint  = each.value

}

#--------------------
# Cloudwatch alarms
# -----------------------

resource "aws_cloudwatch_metric_alarm" "consumed_rcu" {
  count = var.alarms.enabled ? 1 : 0

  alarm_name          = "${local.prefix}-${var.table_name}-high-rcu"
  alarm_description   = "High dynamoDB read capacity usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarms.read_capacity.evaluation_periods
  metric_name         = "ConsumedReadCapacityUnits"
  namespace           = "AWS/DynamoDB"
  period              = var.alarms.read_capacity.period_seconds
  statistic           = "Average"
  threshold           = var.alarms.read_capacity.threshold

  dimensions = {
    TableName = var.table_name
  }

  alarm_actions = [aws_sns_topic.dynamodb_alarms[0].arn]
  ok_actions    = [aws_sns_topic.dynamodb_alarms[0].arn]

  tags = merge(var.tags, {
    Name        = "${var.table_name}-${var.environment}-high-rcu"
    Environment = var.environment
  })
}

resource "aws_cloudwatch_metric_alarm" "consumed_wcu" {
  count = var.alarms.enabled ? 1 : 0

  alarm_name          = "${local.prefix}-${var.table_name}-high-wcu"
  alarm_description   = "High dynamoDB write capacity usage"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarms.write_capacity.evaluation_periods
  metric_name         = "ConsumendWriteCapacityUnits"
  namespace           = "AWS/DynamoDB"
  period              = var.alarms.write_capacity.period_seconds
  statistic           = "Average"
  threshold           = var.alarms.write_capacity.threshold

  dimensions = {
    TableName = var.table_name
  }

  alarm_actions = [aws_sns_topic.dynamodb_alarms[0].arn]
  ok_actions    = [aws_sns_topic.dynamodb_alarms[0].arn]

  tags = merge(var.tags, {
    Name        = "${var.table_name}-${var.environment}-high-wcu"
    Environment = var.environment
  })
}



resource "aws_cloudwatch_metric_alarm" "read_throttle" {
  count = var.alarms.enabled ? 1 : 0

  alarm_name          = "${local.prefix}-${var.table_name}-read-throttle"
  alarm_description   = "Dynamo read throttle events for ${var.table_name}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarms.threshold_requests.evaluation_periods
  metric_name         = "ReadThrottledEvents"
  namespace           = "AWS/DynamoDB"
  period              = var.alarms.threshold_requests.period_seconds
  statistic           = "Sum"
  threshold           = var.alarms.threshold_requests.threshold

  dimensions = {
    TableName = var.table_name
  }

  alarm_actions = [aws_sns_topic.dynamodb_alarms[0].arn]
  ok_actions    = [aws_sns_topic.dynamodb_alarms[0].arn]

  tags = merge(var.tags, {
    Name        = "${local.prefix}-${var.table_name}-read-throttle"
    Environment = var.environment
  })
}


resource "aws_cloudwatch_metric_alarm" "write_throttle" {
  count = var.alarms.enabled ? 1 : 0

  alarm_name          = "${local.prefix}-${var.table_name}-write-throttle"
  alarm_description   = "Dynamo write throttle events for ${var.table_name}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = var.alarms.threshold_requests.evaluation_periods
  metric_name         = "WriteThrottledEvents"
  namespace           = "AWS/DynamoDB"
  period              = var.alarms.threshold_requests.period_seconds
  statistic           = "Sum"
  threshold           = var.alarms.threshold_requests.threshold

  dimensions = {
    TableName = var.table_name
  }

  alarm_actions = [aws_sns_topic.dynamodb_alarms[0].arn]
  ok_actions    = [aws_sns_topic.dynamodb_alarms[0].arn]

  tags = merge(var.tags, {
    Name        = "${local.prefix}-${var.table_name}-write-throttle"
    Environment = var.environment
  })
}
