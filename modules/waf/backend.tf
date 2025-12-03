terraform {
  backend "s3" {
   bucket = "govuk-once-udp-development-542403648748-tfstate"
   key = "udp/waf/terraform.tfstate"
   region = "eu-west-2"
   use_lockfile = true
  }
}

provider "aws" {
  region = "eu-west-2"
  default_tags {
    tags = {
      Environment = var.environment
      Application = "UDP"
      Repo_URL    = "https://github.com/govuk-once/user-data-platform"
    }
  }
}