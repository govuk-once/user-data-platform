
resource "aws_wafv2_web_acl" "this" {
  name = "${var.name_prefix}-waf-${var.environment}"
  description = "WAF Web ACL for ${var.name_prefix} API Gateway"
  scope = "REGIONAL"

  default_action {
    allow {}
  }

  dynamic "rule" {
    for_each = var.rate_limiting.enabled ? [1] : []
    content {
        name = "RateLimitRule"
        priority = 1

        action {
          block {}
        }

        statement {
          rate_based_statement {
            limit = var.rate_limiting.limit
            aggregate_key_type = "IP"
          }
        }

        visibility_config {
          cloudwatch_metrics_enabled = true
          metric_name = "${var.name_prefix}-rate-limit"
          sampled_requests_enabled = true
        }
    }
    
  }

  dynamic "rule" {
    for_each = var.managed_rules.sql_injection.enabled ? [1] :[]
    content {
      name = "AWSManagedRulesSQLiRuleSet"
      priority = 10

      override_action {
        dynamic "none" {
          for_each = var.managed_rules.sql_injection.action == "block" ? [1] : []
          content {}
        }
        dynamic "count" {
          for_each = var.managed_rules.sql_injection.action == "count" ? [1] : []
          content {}
        }
      }

      statement {
        managed_rule_group_statement {
          name = "AWSManagedRulesSQLiRuleSet"
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name = "${var.name_prefix}-sql"
        sampled_requests_enabled = true
      }
    }
    
  }

  dynamic "rule" {
    for_each = var.managed_rules.common.enabled ? [1] : []
    content {
      name = "AWSManagedRulesCommonRuleSet"
      priority = 20

      override_action {
        dynamic "none" {
          for_each = var.managed_rules.sql_injection.action == "block" ? [1] : []
          content {}
        }
        dynamic "count" {
          for_each = var.managed_rules.sql_injection.action == "count" ? [1] : []
          content {}
        }
      }

      statement {
        managed_rule_group_statement {
          name = "AWSManagedRulesCommonRuleSet"
          vendor_name = "AWS"
        }
      }

      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name = "${var.name_prefix}-common"
        sampled_requests_enabled = true
      }
    }
  }

  visibility_config {
     cloudwatch_metrics_enabled = true
     metric_name = "${var.name_prefix}-waf"
     sampled_requests_enabled = true
  }

  tags = merge(var.tags, {
    name = "${var.name_prefix}-waf-${var.environment}"
    environment = var.environment
  })
}

resource "aws_wafv2_web_acl_association" "this" {
    resource_arn = var.api_gateway_stage_arn
    web_acl_arn = aws_wafv2_web_acl.this.arn 
}

resource "aws_cloudwatch_log_group" "waf" {
  count = var.logging.enabled ? 1 : 0

  name = "aws-waf-logs-${var.name_prefix}-${var.environment}"
  retention_in_days = var.logging.retention_days
  
  tags = merge(var.tags, {
    name = "aws-waf-logs-${var.name_prefix}-waf-${var.environment}"
    environment = var.environment
  })
}

resource "aws_wafv2_web_acl_logging_configuration" "this" {
  count = var.logging.enabled ? 1 : 0

  log_destination_configs = [aws_cloudwatch_log_group.waf[0].arn]
  resource_arn = aws_wafv2_web_acl.this.arn

  dynamic "redacted_fields" {
    for_each = var.logging.redact_authorization ? [1] : []
    content {
       single_header {
         name = "authorization"
       }
    }
  }
}