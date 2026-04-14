#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${PINPOINT_DIR:-$HOME/.pinpoint-mcp}"
REPO="https://github.com/maferland/pinpoint-mcp.git"

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

# Install deps
echo -e "  ${DIM}Installing dependencies...${RESET}"
cd "$INSTALL_DIR" && bun install --silent

# Register MCP server
echo -e "  ${DIM}Registering MCP server...${RESET}"
claude mcp add pinpoint -- bun "$INSTALL_DIR/src/main.ts" --stdio 2>/dev/null || true

# Install plugin (skill)
echo -e "  ${DIM}Installing plugin...${RESET}"
claude plugin add "$INSTALL_DIR" 2>/dev/null || true

echo ""
echo -e "  ${GREEN}✓${RESET} Pinpoint installed. Restart Claude Code to activate."
echo -e "  ${DIM}Ask Claude: \"Take a screenshot and open it for annotation\"${RESET}"
echo ""
