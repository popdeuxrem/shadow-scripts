#!/usr/bin/env bash
# ======================================================================
# build-all.sh  •  run locally or in CI
# ======================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONF_DIR="apps/loader/public/configs"
OBF_DIR="apps/loader/public/obfuscated"
PUBLIC_DIR="apps/loader/public"
SRC_JS="src-scripts"
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"

echo "=== [1/8] Clean outputs ==="
rm -rf "$CONF_DIR" "$OBF_DIR"
mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"

echo "=== [2/8] Generate platform configs ==="
export DNS_SERVER
node scripts/gen-shadowrocket.js
node scripts/gen-stash.js
node scripts/gen-loon.js
node scripts/gen-mobileconfig.js

echo "=== [3/8] Obfuscate + Base64 encode payloads ==="
find "$SRC_JS" -type f -name '*.js' | while read -r SRC; do
  base="$(basename "$SRC" .js)"
  obf="$OBF_DIR/$base.ob.js"
  b64="$OBF_DIR/$base.js.b64"
  npx javascript-obfuscator "$SRC" \
      --output "$obf" --compact true --self-defending true --control-flow-flattening true
  base64 "$obf" > "$b64"
done

echo "=== [4/8] Regenerate manifest.json ==="
command -v jq >/dev/null 2>&1 || { echo "❌ jq not found"; exit 1; }
find "$OBF_DIR" -name '*.js.b64' -printf '%f\n' \
  | jq -R . | jq -s . > "$PUBLIC_DIR/manifest.json"

echo "=== [5/8] Generate catalog.html ==="
cp scripts/catalog-template.html "$PUBLIC_DIR/catalog.html"

echo "=== [6/8] Copy manifest loader → index.html ==="
cp scripts/manifest-loader.html   "$PUBLIC_DIR/index.html"

echo "=== [7/8] Validate build artifacts ==="
[ -s "$PUBLIC_DIR/manifest.json" ] || { echo "❌ manifest.json empty"; exit 1; }
find "$PUBLIC_DIR" -type f \( -name '*.js' -o -name '*.json' -o -name '*.b64' \) |
while read -r F; do
  [ -s "$F" ] || { echo "❌ Empty file: $F"; exit 1; }
done

echo "=== [8/8] Summary ==="
echo "Configs         :"; ls -1 "$CONF_DIR"
echo "Obfuscated *.b64:"; ls -1 "$OBF_DIR" | wc -l
echo "Loader          : $PUBLIC_DIR/index.html"
echo "Manifest        : $PUBLIC_DIR/manifest.json"
echo "Catalog         : $PUBLIC_DIR/catalog.html"
echo "=== Build OK — ready for commit / CI deploy ==="
