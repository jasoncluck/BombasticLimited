#!/bin/bash
# Get current branch name
BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Check if branch starts with "copilot"
if [[ $BRANCH == copilot* ]]; then
  echo "Skipping deployment for copilot branch: $BRANCH"
  exit 1
else
  echo "Deploying branch: $BRANCH"
  exit 0
fi
