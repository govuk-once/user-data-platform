output "web_acl_id" {
    description = "ID of the WAF ACL"
    value = aws_wafv2_web_acl.this.id
}

output "web_acl_arn" {
    description = "ARN of the WAF ACL"
    value = aws_wafv2_web_acl.this.arn
}

output "web_acl_name" {
    description = "Name of the WAF ACL"
    value = aws_wafv2_web_acl.this.name
}

output "log_group_arn" {
    description = "ARN of the WAF Cloudeatch log group (if enabled)"
    value = var.logging.enabled ? aws_cloudwatch_log_group.waf[0].arn : null
}