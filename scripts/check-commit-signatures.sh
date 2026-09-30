#!/bin/bash

# Validate that all commits on the pushed ref that are not already on
# origin/main are signed.
#
# This check detects unsigned commits rather than requiring signatures to be
# locally trusted or verified. Developers may use different signing mechanisms
# (for example SSH or GPG), and a developer's machine may not have the keys or
# trust configuration required to verify another developer's signature.
#
# GitHub branch protection remains responsible for final signature verification.

set -euo pipefail

YELLOW='\033[1;33m'
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

ZERO_SHA="0000000000000000000000000000000000000000"

echo -e "${YELLOW}[pre-push]${NC} Checking commit signatures..."

# Ensure origin/main is up to date before determining which commits belong
# to the feature branch.
if ! git fetch origin main --quiet; then
  echo -e "${RED}[pre-push]${NC} Could not update origin/main — cannot check commit signatures"
  exit 1
fi

# Collect the local SHAs being pushed.
#
# Git's pre-push hook provides one line per ref on stdin:
#   <local_ref> <local_sha> <remote_ref> <remote_sha>
#
# Ref deletions have an all-zero local SHA and do not need validation.
# Fall back to HEAD when the script is run directly.
SHAS=()

if [ ! -t 0 ]; then
  while read -r local_ref local_sha remote_ref remote_sha; do
    [ "$local_sha" = "$ZERO_SHA" ] && continue
    SHAS+=("$local_sha")
  done
fi

if [ ${#SHAS[@]} -eq 0 ]; then
  SHAS+=("$(git rev-parse HEAD)")
fi

UNSIGNED=()

for sha in "${SHAS[@]}"; do
  while IFS='|' read -r hash sig subject; do
    [ -z "$hash" ] && continue

    # %G? returns N when the commit has no signature.
    #
    # Other statuses can indicate that a signature exists but cannot be fully
    # verified using the developer's local key/trust configuration. For example:
    # U - good signature with unknown validity
    # E - signature cannot be checked locally
    #
    # These are not treated as unsigned by this local guardrail.
    if [ "$sig" = "N" ]; then
      UNSIGNED+=("$hash $subject")
    fi
  done < <(git log "origin/main..$sha" --format='%h|%G?|%s')
done

if [ ${#UNSIGNED[@]} -eq 0 ]; then
  echo -e "${GREEN}[pre-push]${NC} All commits are signed"
  exit 0
fi

echo -e "${RED}[pre-push]${NC} Unsigned commits found:"
for commit in "${UNSIGNED[@]}"; do
  echo "  $commit"
done

echo ""
echo -e "${RED}[pre-push]${NC} All commits on the feature branch must be signed."
echo "To sign existing commits:"
echo "  git rebase --exec 'git commit --amend --no-edit -S' origin/main"

exit 1
