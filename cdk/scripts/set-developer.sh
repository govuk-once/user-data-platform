#!/bin/bash
#
# Set Developer hash for developmnet isolated environments


set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INFRA_DIR="$(dirname "$SCRIPT_DIR")"

get_developer_id() {
    local git_email
    local git_name
    local hash
    local first_name

    git_email=$(git config --get user.email 2>/dev/null || echo "")
    if [ -z "$git_email" ]; then
        echo "Error: Git email not configured"
        exit 1
    fi

    git_name=$(git config --get user.name 2>/dev/null || echo "")
    if [ -z "$git_name" ]; then
       first_name=$(echo "$git_name" | awk '{print tolower($1)}' | tr -cd 'a-z0-9')
    else
       first_name=$(echo "$git_email" | cut -d'@' -f1 | tr -cd 'a-z0-9' | cut -c1-10)
    fi

    if command -v mdsum &> /dev/null; then
        hash=$(echo -n "$git_email" | md5sum | cut -c1-6)
    elif command -v md5 &> /dev/null; then
        hash=$(echo -n "$git_email" | md5 | cut -c1-6)
    else
         hash=$(echo -n "$git_email" | shasum -a 256 | cut -c1-6)
    fi

    echo "${first_name}-${hash}"
}

DEVELOPER_ID=$(get_developer_id)


echo "$DEVELOPER_ID"
