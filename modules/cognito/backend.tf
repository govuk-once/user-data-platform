terraform {
  backend "s3" {
    bucket = ""
    key = "udp/cognito"
    region = "eu-west-2"
    use_lockfile = true
  }
}