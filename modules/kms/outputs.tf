output "key_arn" {
  description = "ARN of the KMS Key"
  value = aws_kms_key.this.arn
}

output "key_id" {
  description = "ARN of the KMS Key"
  value = aws_kms_key.this.id
}


output "alias_arn" {
  description = "Alias ARN of the KMS Key"
  value = aws_kms_alias.this.arn
}

output "alias_name" {
  description = "Alias name of the KMS Key"
  value = aws_kms_alias.this.name
}