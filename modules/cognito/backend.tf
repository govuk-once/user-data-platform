terraform {
  backend "s3" {
    bucket = "govuk-once-udp-development-542403648748-tfstate"
    key = "udp/cognito/terraform.tfstate"
    region = "eu-west-2"
    use_lockfile = true
  }
}