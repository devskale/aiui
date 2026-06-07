#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-lubu}"
REMOTE_DIR="${DEPLOY_DIR:-/home/woodmastr/code/webuis/aiui}"

echo "🔨 Building..."
pnpm build

echo "📦 Syncing to $HOST:$REMOTE_DIR ..."
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='session/' \
  --exclude='uploads/' \
  --exclude='pi/' \
  --exclude='.pi/' \
  --exclude='.git/' \
  --exclude='test-results/' \
  ./ "$HOST:$REMOTE_DIR/"

echo "🔄 Restarting service..."
ssh "$HOST" "systemctl --user restart aiui"

echo "✅ Deployed to $HOST (port 8082)"
