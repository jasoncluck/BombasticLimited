#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_LAMBDA_DIR="$ROOT/cdk/lib/web-lambda"
STAGING="$WEB_LAMBDA_DIR/dist"

echo "Building SvelteKit app (adapter-node)..."
# Server modules (e.g. $lib/server/cognito.ts, $lib/server/db.ts) read
# process.env directly at module scope, so SvelteKit's build-time static
# analysis pass needs these set even though nothing actually connects out
# during the build — hence sourcing root .env here.
(cd "$ROOT" && set -a && source .env && set +a && npm run build:aws)

echo "Staging Docker build context..."
rm -rf "$STAGING"
mkdir -p "$STAGING"
cp -r "$ROOT/build" "$STAGING/build"
cp "$ROOT/package.json" "$STAGING/package.json"
cp "$ROOT/package-lock.json" "$STAGING/package-lock.json"
cp "$WEB_LAMBDA_DIR/Dockerfile" "$STAGING/Dockerfile"

echo "Staged at $STAGING"
