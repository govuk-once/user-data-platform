#!/bin/bash
#
# Set GDS assumed role, synth CDK, then run Checkov scan.
#
# Usage:
#   bash synth.sh                    # synth all stacks
#   bash synth.sh dev-vpc dev-perf   # synth named stacks only

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

# Optional debug flag: `bash synth.sh --debug dev-sar` waits for a VS Code
# debugger to attach on port 9229 before synthesizing.
DEBUG_SYNTH=false
if [ "${1:-}" = "--debug" ]; then
  DEBUG_SYNTH=true
  shift
fi

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

# Resolve paths relative to this script, not the caller's cwd — this is
# invoked from checkov-scan.sh and from git hooks, where cwd varies.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

cd "${REPO_ROOT}/cdk"

# Stops stale templates being pulled into the scan
rm -rf cdk.out

if [ "$#" -gt 0 ]; then
  echo -e "${YELLOW}[synth]${NC} Synthesizing: $*"
else
  echo -e "${YELLOW}[synth]${NC} Synthesizing all stacks…"
fi

if [ "$DEBUG_SYNTH" = true ]; then
  echo -e "${YELLOW}[synth]${NC} Waiting for debugger on port 9229 — attach from VS Code"

  # Output goes to the terminal, not a log file: the process blocks until a
  # debugger attaches, and the "Debugger listening" line has to be visible.
  CDK_DEBUG=true CDK_DEFAULT_REGION=eu-west-2 \
    ../node_modules/.bin/cdk synth "$@" \
    --app "npx tsx --inspect-brk bin/app.ts"
  exit $?
fi

if ! CDK_DEBUG=true CDK_DEFAULT_REGION=eu-west-2 \
  ../node_modules/.bin/cdk synth --quiet "$@" > /tmp/cdk-synth.log 2>&1; then
  echo -e "${RED}[synth]${NC} cdk synth failed:"
  cat /tmp/cdk-synth.log
  exit 1
fi

echo -e "${GREEN}[synth]${NC} Done"
