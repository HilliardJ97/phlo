#!/bin/bash
set -euo pipefail
workspace_root="$(cd -- "$(dirname -- "$0")" && pwd)"
cd "$workspace_root"
if python3 - <<'PY'
import json,urllib.request
try:
 with urllib.request.urlopen('http://127.0.0.1:8765/api/health',timeout=1) as response:
  assert json.load(response).get('app')=='product-workspace'
except Exception:
 raise SystemExit(1)
PY
then
 open 'http://127.0.0.1:8765'
else
 python3 -B -m phlo_server.product_workspace --open-browser
fi
