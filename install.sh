#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${PINPOINT_DIR:-$HOME/.pinpoint}"
REPO="https://github.com/maferland/pinpoint.git"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
DIM='\033[2m'
RESET='\033[0m'

echo ""
echo -e "  📌 ${RED}Pinpoint${RESET} — visual annotation for AI coding agents"
echo ""

# Check bun
if ! command -v bun &>/dev/null; then
  echo "  bun is required. Install it: https://bun.sh"
  exit 1
fi

# Check claude
if ! command -v claude &>/dev/null; then
  echo "  claude CLI is required. Install it: https://claude.ai/code"
  exit 1
fi

# Clone or update
if [ -d "$INSTALL_DIR" ]; then
  echo -e "  ${DIM}Updating ${INSTALL_DIR}...${RESET}"
  git -C "$INSTALL_DIR" pull --quiet
else
  echo -e "  ${DIM}Cloning to ${INSTALL_DIR}...${RESET}"
  git clone --quiet "$REPO" "$INSTALL_DIR"
fi

# Install deps + build
echo -e "  ${DIM}Installing dependencies...${RESET}"
cd "$INSTALL_DIR" && bun install --silent

echo -e "  ${DIM}Building...${RESET}"
bun run build > /dev/null

# Link the pinpoint CLI binary onto PATH (~/.bun/bin/pinpoint)
echo -e "  ${DIM}Linking pinpoint CLI...${RESET}"
bun link > /dev/null

# Register local marketplace + install plugin (idempotent)
echo -e "  ${DIM}Installing plugin...${RESET}"
claude plugin marketplace add "$INSTALL_DIR" 2>/dev/null || true
claude plugin install pinpoint@pinpoint-marketplace 2>/dev/null || true

# Optional MCP server registration (back door for non-interactive scripting)
echo -e "  ${DIM}Registering MCP server...${RESET}"
claude mcp add pinpoint -- bun "$INSTALL_DIR/src/main.ts" --stdio 2>/dev/null || true

# PATH sanity check
if ! command -v pinpoint &>/dev/null; then
  echo ""
  echo -e "  ${RED}!${RESET} pinpoint not on PATH. Add ~/.bun/bin to PATH:"
  echo -e "    ${DIM}export PATH=\"\$HOME/.bun/bin:\$PATH\"${RESET}"
fi

echo ""
echo -e "  ${GREEN}✓${RESET} Pinpoint installed."
echo -e "  ${DIM}Restart Claude Code, then run: /pinpoint-review /path/to/screenshot.png${RESET}"
echo ""
