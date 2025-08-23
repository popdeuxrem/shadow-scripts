#!/usr/bin/env bash
set -euo pipefail

# Determine the repo root (works from anywhere)
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT"

CONF_OUT="apps/loader/public/configs"
OBF_OUT="apps/loader/public/obfuscated"
SRC_SCRIPTS="src-scripts"

echo "=== [1/6] Clean outputs ==="
rm -rf "$CONF_OUT" "$OBF_OUT"
mkdir -p "$CONF_OUT" "$OBF_OUT"

echo "=== [2/6] Generate multi-platform configs ==="
node scripts/gen-shadowrocket.js
node scripts/gen-stash.js
node scripts/gen-loon.js

# --- Mobileconfig: Require DNS_SERVER as env or first arg ---
if [[ -z "${DNS_SERVER:-}" && $# -lt 1 ]]; then
  echo "❌ Please provide DNS_SERVER env or argument (IP address required, not hostname/domain)"
  exit 1
fi

DNS_IP="${DNS_SERVER:-$1}"
if [[ ! "$DNS_IP" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ DNS_SERVER must be a valid IP address (not a hostname): $DNS_IP"
  exit 1
fi
DNS_SERVER="$DNS_IP" node scripts/gen-mobileconfig.js

echo "=== [3/6] Obfuscate and Base64-encode scripts ==="
find "$SRC_SCRIPTS" -type f -name "*.js" | while read src; do
  base=$(basename "$src" .js)
  obf="$OBF_OUT/$base.ob.js"
  b64="$OBF_OUT/$base.js.b64"
  npx javascript-obfuscator "$src" --output "$obf" --compact true --self-defending true --control-flow-flattening true
  base64 "$obf" > "$b64"
done

echo "=== [4/6] Generate catalog and manifest ==="
node scripts/gen-catalog.js

echo "=== [5/6] Validate configs ==="
node scripts/validate-configs.js

echo "=== [6/6] Summary ==="
ls -lh "$CONF_OUT"
ls -lh "$OBF_OUT"
echo "Catalog: $ROOT/apps/loader/public/catalog.html"
echo "=== Build complete. Ready for deploy/CI. ==="
