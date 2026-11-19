#!/bin/bash
# Double-click to open Phlo in Chrome. Keep this window open while you use Phlo.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT="${PHLO_PORT:-8790}"

if ! command -v node >/dev/null 2>&1; then
  echo "Phlo needs Node.js 22+. Install it from https://nodejs.org (or: brew install node), then double-click again."
  read -r -p "Press Return to close." _; exit 1
fi
[ -d node_modules ] || { echo "Installing (first run only)…"; npm install --no-audit --no-fund || exit 1; }

echo "Building…"
npm run build:renderer --silent >/dev/null || exit 1

if command -v codex >/dev/null 2>&1 && codex login status 2>&1 | grep -qi chatgpt; then
  echo "ChatGPT: connected through Codex (your plan)."
else
  echo "ChatGPT isn't connected. To use your plan: npm i -g @openai/codex && codex login"
  echo "Until then Phlo settles with fast local rules."
fi

echo "Opening Phlo at http://127.0.0.1:$PORT …"
( sleep 2; open -a "Google Chrome" "http://127.0.0.1:$PORT" 2>/dev/null || open "http://127.0.0.1:$PORT" ) &
PHLO_PORT="$PORT" npx tsx src/host/server.ts
