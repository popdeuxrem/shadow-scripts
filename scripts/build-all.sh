#!/usr/bin/env bash
# Full build pipeline: scripts → obfuscate → manifest → loader → validate
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONF_DIR="apps/loader/public/configs"
OBF_DIR="apps/loader/public/obfuscated"
PUBLIC_DIR="apps/loader/public"
SRC_JS="src-scripts"
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
PREFER_GROUP="${MOBILECONFIG_GROUP:-US}"

die() { echo "❌ $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

pick_obfuscator() {
  if have npx; then echo "npx --yes javascript-obfuscator"; return; fi
  if have pnpm; then echo "pnpm dlx javascript-obfuscator"; return; fi
  die "❌ javascript-obfuscator not available and no npx/pnpm found"
}
OBF_CMD="$(pick_obfuscator)"

ensure_dirs() {
  rm -rf "$CONF_DIR" "$OBF_DIR"
  mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"
}

echo "=== [1/8] Clean outputs ==="
ensure_dirs

echo "=== [2/8] Generate configs: Shadowrocket, Loon, Stash, Mobileconfig ==="
export DNS_SERVER PREFER_GROUP
node scripts/gen-shadowrocket.js || die "❌ gen-shadowrocket.js failed"
node scripts/gen-loon.js         || die "❌ gen-loon.js failed"
node scripts/gen-stash.js        || die "❌ gen-stash.js failed"
node scripts/gen-mobileconfig.js || echo "↷ Mobileconfig skipped (optional)"

echo "=== [3/8] Obfuscate + Base64 payloads ==="
if [[ -d "$SRC_JS" ]] && compgen -G "$SRC_JS/*.js" >/dev/null; then
  find "$SRC_JS" -type f -name '*.js' | sort | while read -r SRC; do
    base="$(basename "$SRC" .js)"
    obf="$OBF_DIR/$base.ob.js"
    b64="$OBF_DIR/$base.js.b64"
    $OBF_CMD "$SRC" \
      --output "$obf" \
      --compact true \
      --self-defending true \
      --control-flow-flattening true
    base64 "$obf" > "$b64"
    [[ -s "$b64" ]] || die "Empty payload after obfuscation: $b64"
  done
else
  echo "↷ No JS payloads in $SRC_JS"
fi

echo "=== [4/8] Generate manifest.json ==="
node scripts/gen-catalog.js || die "❌ gen-catalog.js failed"

if have jq; then
  (cd "$OBF_DIR" && printf "%s\n" *.js.b64 | jq -R . | jq -s .) > "$PUBLIC_DIR/manifest.json"
else
  node - <<'JS' "$OBF_DIR" "$PUBLIC_DIR/manifest.json"
    const fs = require('fs'), path = require('path');
    const dir = process.argv[2], out = process.argv[3];
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.js.b64')).sort();
    fs.writeFileSync(out, JSON.stringify(files, null, 2) + "\n");
JS
fi

echo "=== [5/8] Generate mitm-loader.js ==="
node scripts/gen-mitm-loader.js || echo "↷ mitm-loader skipped (optional)"

echo "=== [6/8] Copy catalog.html + index.html ==="
cp scripts/catalog-template.html "$PUBLIC_DIR/catalog.html"
cp scripts/manifest-loader.html "$PUBLIC_DIR/index.html"

echo "=== [7/8] Validate outputs ==="
[[ -s "$PUBLIC_DIR/manifest.json" ]] || die "manifest.json empty"
find "$OBF_DIR" -name '*.js.b64' -size 0 -print -quit | grep -q . && die "Zero-byte .js.b64 file"

echo "=== [8/8] Summary ==="
echo "Configs:"
ls -1 "$CONF_DIR" 2>/dev/null || true
count=$(find "$OBF_DIR" -name '*.js.b64' | wc -l)
echo "Obfuscated payloads: $count"
echo "Manifest : $PUBLIC_DIR/manifest.json"
echo "Catalog  : $PUBLIC_DIR/catalog.html"
echo "Loader   : $PUBLIC_DIR/index.html"
echo "MITM     : $PUBLIC_DIR/mitm-loader.js"
echo "✅ Build complete."
