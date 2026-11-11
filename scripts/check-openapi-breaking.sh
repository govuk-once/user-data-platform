#!/bin/bash
#
# Compares docs/openapi.yml on the current branch against the same file on
# origin/main and fails if any ERR-level (level >= 3) breaking changes are
# found via oasdiff.
#
# Environment variables:
#   OVERRIDE  set to "true" to accept breaking changes (via the
#             'breaking-change-accepted' PR label) and exit 0 regardless.

set -euo pipefail

CURRENT_SPEC="docs/openapi.yml"
LATEST_SPEC="/tmp/openapi-latest.yml"

if ! git show origin/main:"$CURRENT_SPEC" > "$LATEST_SPEC" 2>/dev/null; then
  echo "No $CURRENT_SPEC on main yet, skipping check."
  exit 0
fi

# Spec deleted in this PR = breaking change
if [ ! -f "$CURRENT_SPEC" ]; then
  echo "- ❌ \`$CURRENT_SPEC\`: **spec removed**"
  if [ "${OVERRIDE:-false}" = "true" ]; then
    echo ""
    echo "⚠️ Breaking changes were accepted via the 'breaking-change-accepted' label."
    exit 0
  fi
  exit 1
fi

# Capture stdout/stderr separately so we can distinguish
# "oasdiff found breaking changes" (non-zero + JSON output)
# from "oasdiff itself crashed" (non-zero + no output)
BREAKING=$(oasdiff breaking "$LATEST_SPEC" "$CURRENT_SPEC" --format json 2>/tmp/oasdiff-stderr.txt)
OASDIFF_EXIT=$?

if [ $OASDIFF_EXIT -ne 0 ] && [ -z "$BREAKING" ]; then
  echo "oasdiff failed:" >&2
  cat /tmp/oasdiff-stderr.txt >&2
  exit 1
fi

if [ -z "$BREAKING" ]; then
  echo "✅ No breaking changes detected."
  exit 0
fi

# Validate JSON before parsing (guards against unexpected oasdiff output)
if ! echo "$BREAKING" | jq empty 2>/tmp/jq-stderr.txt; then
  echo "oasdiff produced unexpected output:" >&2
  echo "$BREAKING" >&2
  cat /tmp/jq-stderr.txt >&2
  exit 1
fi

ERRORS=$(echo "$BREAKING" | jq '[.[] | select(.level >= 3)]')
COUNT=$(echo "$ERRORS" | jq 'length')

if [ "$COUNT" -eq 0 ]; then
  echo "✅ No breaking changes detected."
  exit 0
fi

echo "- ❌ \`$CURRENT_SPEC\`: **${COUNT} breaking change(s)**"
echo "$ERRORS" | jq -r \
  '.[] | "    - `\(.id)`\(if .operation then " (\(.operation)\(if .path then " \(.path)" else "" end))" else "" end): \(.text)"'

if [ "${OVERRIDE:-false}" = "true" ]; then
  echo ""
  echo "⚠️ Breaking changes were accepted via the 'breaking-change-accepted' label."
  exit 0
fi

exit 1
