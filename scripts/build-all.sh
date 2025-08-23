#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT"

CONF_OUT="apps/loader/public/configs"
OBF_OUT="apps/loader/public/obfuscated"
SRC_SCRIPTS="src-scripts"
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"

echo "=== [1/6] Clean outputs ==="
rm -rf "$CONF_OUT" "$OBF_OUT"
mkdir -p "$CONF_OUT" "$OBF_OUT"

echo "=== [2/6] Generate multi-platform configs ==="
export DNS_SERVER
node scripts/gen-shadowrocket.js
node scripts/gen-stash.js
node scripts/gen-loon.js
node scripts/gen-mobileconfig.js

echo "=== [3/6] Obfuscate and Base64-encode scripts ==="
find "$SRC_SCRIPTS" -type f -name "*.js" | while read -r src; do
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
