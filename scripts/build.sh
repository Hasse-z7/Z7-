#!/bin/bash
set -Eeuo pipefail

COZE_WORKSPACE_PATH="${COZE_WORKSPACE_PATH:-$(pwd)}"

cd "${COZE_WORKSPACE_PATH}"

echo "Installing dependencies..."
pnpm install --prefer-frozen-lockfile --prefer-offline --loglevel debug --reporter=append-only

echo "Building the Next.js project..."
# Temporarily rename .babelrc to force webpack build (Turbopack crashes with custom babel config)
# react-dev-inspector babel plugin is dev-only, not needed in production
if [ -f .babelrc ]; then
  mv .babelrc .babelrc.dev.bak
fi
NEXT_FORCE_WEBPACK=1 pnpm next build --webpack
# Restore .babelrc for local dev
if [ -f .babelrc.dev.bak ]; then
  mv .babelrc.dev.bak .babelrc
fi

echo "Bundling server with tsup..."
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify

echo "Build completed successfully!"
