#!/usr/bin/env bash
# ════════════════════════════════════════════════════════════════════
# generate-image skill installer
#
# Symlinks the tracked `generate-image` launcher into ~/.local/bin so it's
# globally available on PATH. The launcher is self-contained Node (>=18),
# so no dependencies to sync — unlike web-search there's no uv/pyproject.
# ════════════════════════════════════════════════════════════════════
set -e
SKILL_DIR="$(cd "$(dirname "$0")" && pwd)"
LAUNCHER="$SKILL_DIR/generate-image"

echo "Installing generate-image skill..."
echo "  Skill dir: $SKILL_DIR"

if [ ! -f "$LAUNCHER" ]; then
  echo "✗ launcher not found: $LAUNCHER"
  exit 1
fi
chmod +x "$LAUNCHER"

# ── Verify node >= 18 (for global fetch) ──
if ! command -v node >/dev/null 2>&1; then
  echo "✗ node not found. Install Node >= 18."
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  echo "✗ node >= 18 required (found $(node -v))."
  exit 1
fi
echo "  node: $(node -v)"

# ── Create global launcher symlink ──
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
TARGET="$BIN_DIR/generate-image"

if [ -L "$TARGET" ] || [ -f "$TARGET" ]; then
  if [ "$(readlink "$TARGET" 2>/dev/null)" != "$LAUNCHER" ]; then
    echo "  Removing old launcher at $TARGET"
    rm -f "$TARGET"
  fi
fi

if [ ! -e "$TARGET" ]; then
  ln -sf "$LAUNCHER" "$TARGET"
  echo "  Created symlink: $TARGET → $LAUNCHER"
else
  echo "  Launcher already up to date: $TARGET"
fi

# ── Verify ──
export PATH="$BIN_DIR:$PATH"
if command -v generate-image >/dev/null 2>&1; then
  echo "✓ Installed. Try: generate-image \"a red cube\""
else
  echo "⚠  generate-image not on PATH. Add ~/.local/bin to your PATH."
fi
