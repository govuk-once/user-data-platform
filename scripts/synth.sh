#!/bin/bash
#
# Set GDS assumed role, synth CDK, then run Checkov scan.

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}[synth]${NC} Assuming role…"

if ! CREDS=$(gds-cli aws once-udp-development-admin -e 2>/tmp/gds-err.log); then
  echo -e "${RED}[synth]${NC} Failed to assume role:"
  cat /tmp/gds-err.log
  echo -e "${YELLOW}[synth]${NC} Are you on the VPN or an office IP range?"
  exit 1
fi

eval "$CREDS"

if ! aws sts get-caller-identity > /dev/null 2>&1; then
  echo -e "${RED}[synth]${NC} Role assumed but credentials not usable — check VPN"
  cat /tmp/gds-err.log
  exit 1
fi

# Move to cdk folder
cd cdk

# Stops stale templates being pulled into the scan
rm -rf cdk.out

echo -e "${YELLOW}[synth]${NC} Synthesizing…"

if ! CDK_DEBUG=true CDK_DEFAULT_REGION=eu-west-2 ../node_modules/.bin/cdk synth --quiet > /tmp/cdk-synth.log 2>&1; then
  echo -e "${RED}[synth]${NC} cdk synth failed:"
  cat /tmp/cdk-synth.log
  exit 1
fi
