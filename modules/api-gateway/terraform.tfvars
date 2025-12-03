env = "dev"

use_remote_state = true
state_bucket = "govuk-once-udp-development-542403648748-tfstate"

jwt_authorizer = {
    enabled = true
    issuer = "" #polulated byt remote state
    audience = [] #polulated byt remote state
}