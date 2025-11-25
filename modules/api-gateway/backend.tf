terraform {
  backend "s3" {
    bucket = ""
    key = "udp/api-gateway"
    region = "eu-west-2"
    use_lockfile = true
  }
}