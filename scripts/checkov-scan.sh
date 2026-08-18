#!/bin/bash
#
# Set GDS assumed role, synth CDK, then run Checkov scan.

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Optional single-check filter: `./checkov-scan.sh CKV_AWS_158` scans one rule.
CHECK_ARG=""
if [ "${1:-}" != "" ]; then
  CHECK_ARG="--check $1"
fi

# Run synth script
bash "${SCRIPT_DIR}/synth.sh"

# Run Checkov Scan
echo -e "${YELLOW}[pre-commit]${NC} Scanning…"
rm -f checkov-results.json
# shellcheck disable=SC2086
checkov -d cdk.out --config-file .checkov.yaml $CHECK_ARG \
  -o json --quiet 2>/dev/null > checkov-results.json || true

if [ ! -f checkov-results.json ]; then
  echo -e "${RED}[pre-commit]${NC} checkov produced no results file — scan errored"
  exit 1
fi

# Every jq below is guarded with `// 0` / `|| true` so an empty result set
# (e.g. a single --check that matches nothing) can't trip `set -e`.
echo ""
jq -r '.summary | "Checkov: \(.passed) passed, \(.failed) failed, \(.skipped) skipped"' \
  checkov-results.json || true

FAILED=$(jq -r '.summary.failed // 0' checkov-results.json)

if [ "$FAILED" -gt 0 ]; then
  echo ""
  echo -e "${RED}[pre-commit]${NC} Failures by check:"
  jq -r '
    .results.failed_checks
    | group_by(.check_id)
    | sort_by(-length)
    | .[]
    | "  \(.[0].check_id)  x\(length)  \(.[0].check_name // "")",
      (.[] | "      \(.file_path)  →  \(.resource | sub("^[^.]+\\.";""))")
  ' checkov-results.json || true
  echo ""
  echo -e "${RED}[pre-commit]${NC} Checkov failed with ${FAILED} issue(s)"
  exit 1
fi

echo -e "${GREEN}[pre-commit]${NC} Checkov passed"
exit 0
