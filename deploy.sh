#!/usr/bin/env bash
set -euo pipefail

HOST="${DEPLOY_HOST:-lubu}"
REMOTE_DIR="${DEPLOY_DIR:-/home/woodmastr/code/webuis/aiui}"

echo "🔨 Building..."
VITE_BASE=/aiui/ pnpm build

echo "📦 Syncing to $HOST:$REMOTE_DIR ..."
rsync -avz --delete \
  --exclude='node_modules/' \
  --exclude='session/' \
  --exclude='workspace/' \
  --exclude='uploads/' \
  --exclude='pi/' \
  --exclude='.pi/' \
  --exclude='.git/' \
  --exclude='test-results/' \
  ./ "$HOST:$REMOTE_DIR/"

echo "🔄 Installing deps + restarting service..."
ssh "$HOST" "export CI=true PATH=/home/woodmastr/.nvm/versions/node/v24.13.0/bin:/home/woodmastr/.local/share/pnpm/bin:\$PATH; cd $REMOTE_DIR && pnpm install --frozen-lockfile && systemctl --user restart aiui"

echo "✅ Deployed to $HOST (port 8082)"
