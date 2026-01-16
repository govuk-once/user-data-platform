#!/bin/bash
#
# Set Developer hash for developmnet isolated environments

set -e

BUILD_STATUS=$(aws codebuild batch-get-builds --ids 'pr-58-dev-e2e-cucumber-tests:4b0cab72-5907-44e8-8484-863d102a5d26' --query 'builds[0].currentPhase'  --output text)          
echo "CodeBuild project: ${BUILD_STATUS}"