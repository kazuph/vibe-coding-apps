#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
GAS_DIR="$ROOT_DIR/scripts/gas"
cd "$GAS_DIR"

echo "[GAS] Using directory: $GAS_DIR"

if ! command -v npx >/dev/null 2>&1; then
  echo "npx is required (Node.js)" >&2
  exit 1
fi

echo "[GAS] Checking clasp login (make sure you ran 'clasp login')"
npx -y @google/clasp --version >/dev/null

if [ ! -f .clasp.json ]; then
  echo "[GAS] Creating new Apps Script project..."
  npx -y @google/clasp create --title codraw-gas --type standalone
fi

echo "[GAS] Ensuring rootDir in .clasp.json"
node - <<'NODE'
const fs=require('fs');
const p='.clasp.json';
let j={};
try{j=JSON.parse(fs.readFileSync(p,'utf8'))}catch{}
j.rootDir=j.rootDir||'.';
fs.writeFileSync(p,JSON.stringify(j,null,2));
console.log('[GAS] Script ID:', j.scriptId||'(unknown)');
NODE

echo "[GAS] Pushing source..."
npx -y @google/clasp push

echo "[GAS] Deploying web app (initial or new version)..."
DEPLOY_OUT=$(npx -y @google/clasp deploy -d initial 2>&1 || true)
echo "$DEPLOY_OUT"
# Extract deployment ID
DEPLOY_ID=$(echo "$DEPLOY_OUT" | grep -Eo 'AKfycb[[:alnum:]_-]+' | tail -n1 || true)
if [ -z "$DEPLOY_ID" ]; then
  echo "[GAS] Could not find deployment ID in output. Please deploy once via UI, then rerun." >&2
  exit 1
fi
URL="https://script.google.com/macros/s/${DEPLOY_ID}/exec"
echo "[GAS] Web App URL: $URL"

echo "[GAS] Writing Web App URL to .dev.vars"
if grep -q '^GAS_FALLBACK_URL=' "$ROOT_DIR/.dev.vars"; then
  perl -0777 -pe 's/^GAS_FALLBACK_URL=.*/GAS_FALLBACK_URL=$ENV{URL}/m' -i "$ROOT_DIR/.dev.vars"
else
  printf "\nGAS_FALLBACK_URL=%s\n" "$URL" >> "$ROOT_DIR/.dev.vars"
fi

echo "[GAS] Bootstrapping Script Properties via Web App (one-time) ..."
TOKEN=$(grep -E '^GAS_ACCESS_TOKEN=' "$ROOT_DIR/.dev.vars" | sed 's/^[^=]*=//') || TOKEN=""
GEMINI=$(grep -E '^(GEMINI_API_KEY|GEMINI_API_TOKEN)=' "$ROOT_DIR/.dev.vars" | tail -n1 | sed 's/^[^=]*=//') || GEMINI=""
BOOT_JSON=$(node -e 'const t=process.argv[1], g=process.argv[2]; const b={__adminSetProps:true, props:{ACCESS_TOKEN:t}}; if(g) b.props.GEMINI_API_KEY=g; process.stdout.write(JSON.stringify(b));' "$TOKEN" "$GEMINI")
HTTP_STATUS=$(curl -sS -o /tmp/gas-bootstrap.out -w "%{http_code}" -X POST -H 'Content-Type: application/json' --data "$BOOT_JSON" "$URL" || true)
echo "[GAS] Bootstrap HTTP status: $HTTP_STATUS"
echo "[GAS] Bootstrap response: $(cat /tmp/gas-bootstrap.out)"

echo "[GAS] Done."
