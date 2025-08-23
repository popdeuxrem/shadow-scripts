#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
cd "$ROOT"

CONF_OUT="apps/loader/public/configs"
OBF_OUT="apps/loader/public/obfuscated"
PUBLIC="apps/loader/public"
SRC_SCRIPTS="src-scripts"
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"

echo "=== [1/7] Clean outputs ==="
rm -rf "$CONF_OUT" "$OBF_OUT"
mkdir -p "$CONF_OUT" "$OBF_OUT"

echo "=== [2/7] Generate multi-platform configs ==="
export DNS_SERVER
node scripts/gen-shadowrocket.js
node scripts/gen-stash.js
node scripts/gen-loon.js
node scripts/gen-mobileconfig.js

echo "=== [3/7] Obfuscate & base64 encode scripts ==="
find "$SRC_SCRIPTS" -type f -name '*.js' | while read -r src; do
  base=$(basename "$src" .js)
  obf="$OBF_OUT/$base.ob.js"
  b64="$OBF_OUT/$base.js.b64"
  npx javascript-obfuscator "$src" \
      --output "$obf" --compact true --self-defending true --control-flow-flattening true
  base64 "$obf" > "$b64"
done

echo "=== [4/7] Regenerate manifest.json ==="
find "$OBF_OUT" -name '*.js.b64' -printf '%f\n' \
  | jq -R . | jq -s . > "$PUBLIC/manifest.json"

echo "=== [5/7] Generate catalog.html ==="
node scripts/gen-catalog.js

echo "=== [6/7] Copy manifest-loader → index.html ==="
cp scripts/manifest-loader.html "$PUBLIC/index.html"

echo "=== [7/7] Summary ==="
ls -lh "$CONF_OUT" | sed 's/^/CONFIGS  /'
ls -lh "$OBF_OUT"  | sed 's/^/OBF      /'
echo "Manifest : $PUBLIC/manifest.json"
echo "Catalog  : $PUBLIC/catalog.html"
echo "Loader   : $PUBLIC/index.html"
echo "=== Build complete. Ready for CI deploy ==="
