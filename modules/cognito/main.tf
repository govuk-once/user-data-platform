# ---
# Cloudwatch log group
# ----
resource "aws_cloudwatch_log_group" "cognito" {
    count = var.logging.enabled ? 1 : 0

    name = "/aws/cognito/${var.user_pool_name}-${var.environment}"
    retention_in_days = var.logging.retention_in_days
    kms_key_id = var.logging.kms_key_arn

    tags = merge(var.tags,  {
        name = "${var.user_pool_name}-${var.environment}-logs"
    })
  
}

# ---
# IAM policy for cloudwatch logs
# ----
data "aws_iam_policy_document" "cognito_logging" {
  count = var.logging.enabled ? 1 : 0

  statement {
    effect = "Allow"
    principals {
       type = "Service"
       identifiers = ["cognito-idp.amazon.com"]
    }
    actions = [
        "logs:CreateLogStream",
        "logs:PutLogEvents"
    ]
    resources = ["${aws_cloudwatch_log_group.cognito[*].arn}:*"]
  }
}

resource "aws_cloudwatch_log_resource_policy" "cognito" {
    count = var.logging.enabled ? 1 : 0

    policy_name = "${var.user_pool_name}-${var.environment}-cognito-logging"
    policy_document = data.aws_iam_policy_document.cognito_logging[0].json
}

# ---
# Cognito User pool
# ----
resource "aws_cognito_user_pool" "main" {
    name = "${var.user_pool_name}-${var.environment}"

    admin_create_user_config {
      allow_admin_create_user_only = true
    }

    password_policy {
      minimum_length = 12
      require_lowercase = true
      require_numbers = true
      require_symbols = true
      require_uppercase = true
      temporary_password_validity_days = 7
    }

    account_recovery_setting {
      recovery_mechanism {
        name = "admin_only"
        priority = 1
      }
    }

    # logging config
    dynamic "user_pool_add_ons" {
      for_each = var.logging.enabled ? [1] : []
      content {
        advanced_security_mode = var.logging.advanced_security_mode
      }
    }

    tags = merge(var.tags, {
        name = "${var.user_pool_name}-${var.environment}"
        environment = var.environment
    })


    depends_on = [ aws_cloudwatch_log_resource_policy.cognito ]

}
# ---
# User pool domain
# ----
resource "aws_cognito_user_pool_domain" "main" {
    domain = "${var.domain_prefix}-${var.environment}"
    user_pool_id = aws_cognito_user_pool.main.id
  
}
# ---
# Resource server
# ----
resource "aws_cognito_resource_server" "api" {
    identifier = var.resource_server_identifier
    name = "${var.resource_server_name}-${var.environment}"
    user_pool_id = aws_cognito_user_pool.main.id  

    dynamic "scope" {
      for_each = var.resource_server_scopes
      content {
        scope_name = scope.value.name
         scope_description = scope.value.description
      }
    }
}


# ---
# M2M App CLient
# ----
resource "aws_cognito_user_pool_client" "m2m" {
    for_each = var.m2m_clients

    name = "${each.key}-${ar.environment}"
    user_pool_id = aws_cognito_user_pool.main.id

    generate_secret = true

    allowed_oauth_flows = ["client_credentials"]
    allowed_oauth_flows_user_pool_client = true
    allowed_oauth_scopes = each.value.scopes

    access_token_validity = each.value.access_token_validity_minutes
    token_validity_units {
      access_token = "minutes"
    }

    explicit_auth_flows = []

    supported_identity_providers = []

    prevent_user_existence_errors = "ENABLED"

    depends_on = [ aws_cognito_resource_server.api ]
}


# ---
# Alarm Notifications
# ----

resource "aws_sns_topic" "cognito_alarms" {
   count = var.logging.enabled ? 1 : 0

   name = "${var.user_pool_name}-${var.environment}-cognito-alarms"

   tags = merge(var.tags, {
    name = "${var.user_pool_name}-${var.environment}-cognito-alarms"
   })
}

resource "aws_sns_topic_subscription" "alarm_email" {
    for_each = var.alarms.enabled ? toset(var.alarms.notification_emails) : toset([])

    topic_arn = aws_sns_topic.cognito_alarms[0].arn
    protocol = "email"
    endpoint = each.value
}

#alarm Throttling - token requests are being throttled
resource "aws_cloudwatch_metric_alarm" "throttling" {
    count = var.alarms.enabled ? 1 : 0

    alarm_name = "${var.user_pool_name}-${var.environment}-throttling"
    alarm_description = "Alert when cognito requests are being throttled"
    comparison_operator = "GreaterThanThreashold"
    evaluation_periods = var.alarms.throttling.evaluation_periods
    metric_name = "CallCount"
    namespace = "AWS/Cognito"
    period = var.alarms.throttling.period_seconds
    statistic = "Sum"
    threshold = var.alarms.throttling.threashold

    dimensions = {
        UserPool = aws_cognito_user_pool.main.id
        Service = "Cognito User Pools"
    }

    alarm_actions = var.alarms.enabled ? [aws_sns_topic.cognito_alarms[0].arn] : []
    ok_actions = var.alarms.enabled ? [aws_sns_topic.cognito_alarms[0].arn] : []

    tags = merge(var.tags, {
        name = "${var.user_pool_name}-${var.environment}-throttling"
    })
  
}


resource "aws_cloudwatch_metric_alarm" "compromised-credentials" {
    count = var.alarms.enabled && var.logging.advanced_security_mode != "OFF" ? 1 : 0

    alarm_name = "${var.user_pool_name}-${var.environment}-compromised-credentials"
    alarm_description = "Alert when compromised credentials are detected"
    comparison_operator = "GreaterThanThreashold"
    evaluation_periods = 1
    metric_name = "CompromisedCredentialRisk"
    namespace = "AWS/Cognito"
    period = 300
    statistic = "Sum"
    threshold = 0
    treat_missing_data = "notBreeching"

    dimensions = {
        UserPool = aws_cognito_user_pool.main.id
        RiskLevel = "High"
    }

    alarm_actions = var.alarms.enabled ? [aws_sns_topic.cognito_alarms[0].arn] : []
    ok_actions = var.alarms.enabled ? [aws_sns_topic.cognito_alarms[0].arn] : []

    tags = merge(var.tags, {
        name = "${var.user_pool_name}-${var.environment}-comprmised-credentials"
    })
}

resource "aws_cloudwatch_metric_alarm" "account_takeover_risk" {
    count = var.alarms.enabled && var.logging.advanced_security_mode != "OFF" ? 1 : 0

    alarm_name = "${var.user_pool_name}-${var.environment}-account-takeover-risk"
    alarm_description = "Alert when Account takeover risk is detected"
    comparison_operator = "GreaterThanThreashold"
    evaluation_periods = 1
    metric_name = "AccountTakeoverRisk"
    namespace = "AWS/Cognito"
    period = 300
    statistic = "Sum"
    threshold = 0
    treat_missing_data = "notBreeching"

    dimensions = {
        UserPool = aws_cognito_user_pool.main.id
        RiskLevel = "High"
    }

    alarm_actions = var.alarms.enabled ? [aws_sns_topic.cognito_alarms[0].arn] : []
    ok_actions = var.alarms.enabled ? [aws_sns_topic.cognito_alarms[0].arn] : []

    tags = merge(var.tags, {
        name = "${var.user_pool_name}-${var.environment}-account-takeover-risk"
    })
}