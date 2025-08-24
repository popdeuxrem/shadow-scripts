#!/usr/bin/env bash
# scripts/build-all.sh
# ──────────────────────────────────────────────────────────────
# Master build orchestrator
#   1. clean outputs
#   2. generate all platform configs
#   3. obfuscate + base64 payloads
#   4. regenerate manifest.json
#   5. generate mitm-loader.js  ← NEW
#   6. copy catalog / loader html
#   7. validate artefacts
#   8. summary
# ──────────────────────────────────────────────────────────────
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONF_DIR="apps/loader/public/configs"
OBF_DIR="apps/loader/public/obfuscated"
PUBLIC_DIR="apps/loader/public"
SRC_JS="src-scripts"
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
PREFER_GROUP="${MOBILECONFIG_GROUP:-US}"

die()  { echo "❌ $*" >&2; exit 1; }
have() { command -v "$1" &>/dev/null; }

# 0. prerequisites ────────────────────────────────────────────
have node || die "node not found"
have pnpm || die "pnpm not found (enable corepack)"

OBF_CMD="pnpm dlx javascript-obfuscator"
$OBF_CMD --version >/dev/null 2>&1 || die "javascript-obfuscator not installed (pnpm add -D javascript-obfuscator)"

# 1. clean outputs ────────────────────────────────────────────
echo "=== [1/8] Clean outputs ==="
rm -rf "$CONF_DIR" "$OBF_DIR"
mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"

# 2. generate configs ────────────────────────────────────────
echo "=== [2/8] Generate platform configs ==="
export DNS_SERVER PREFER_GROUP
for gen in gen-shadowrocket.js gen-stash.js gen-loon.js gen-mobileconfig.js; do
  [[ -f "scripts/$gen" ]] && node "scripts/$gen" || echo "↷ skip: scripts/$gen"
done

# 3. obfuscate payloads ───────────────────────────────────────
echo "=== [3/8] Obfuscate + Base64 encode payloads ==="
if compgen -G "$SRC_JS/*.js" >/dev/null; then
  find "$SRC_JS" -type f -name '*.js' | sort | while read -r SRC; do
    base="$(basename "$SRC" .js)"
    obf="$OBF_DIR/$base.ob.js"
    b64="$OBF_DIR/$base.js.b64"
    $OBF_CMD "$SRC" --output "$obf" --compact true --self-defending true --control-flow-flattening true
    base64 "$obf" > "$b64"
    [[ -s "$b64" ]] || die "empty payload: $b64"
  done
else
  echo "↷ no source payloads under $SRC_JS"
fi

# 4. manifest.json ────────────────────────────────────────────
echo "=== [4/8] Regenerate manifest.json ==="
if have jq; then
  ( cd "$OBF_DIR" && ls *.js.b64 2>/dev/null | jq -R . | jq -s . ) > "$PUBLIC_DIR/manifest.json"
else
  node - <<'NODE' "$OBF_DIR" "$PUBLIC_DIR/manifest.json"
    const fs=require('fs'),p=require('path');
    const dir=process.argv[2],out=process.argv[3];
    let files=[];
    try{files=fs.readdirSync(dir).filter(f=>f.endsWith('.js.b64')).sort();}catch{}
    fs.mkdirSync(p.dirname(out),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(files,null,2)+'\n');
NODE
fi

# 5. mitm-loader.js (dynamic) ─────────────────────────────────
echo "=== [5/8] Generate mitm-loader.js ==="
node scripts/gen-mitm-loader.js

# 6. static html assets ───────────────────────────────────────
echo "=== [6/8] Copy catalog + loader html ==="
cp scripts/catalog-template.html  "$PUBLIC_DIR/catalog.html" 2>/dev/null || echo "↷ no catalog-template.html"
cp scripts/manifest-loader.html   "$PUBLIC_DIR/index.html"   2>/dev/null || echo "↷ no manifest-loader.html"

# 7. validation ───────────────────────────────────────────────
echo "=== [7/8] Validate build artifacts ==="
[[ -s "$PUBLIC_DIR/manifest.json" ]] || die "manifest.json missing/empty"
find "$OBF_DIR" -name '*.js.b64' -empty -print -quit | grep -q . && die "zero-byte .js.b64 detected"

# 8. summary ──────────────────────────────────────────────────
echo "=== [8/8] Summary ==="
echo "Configs      : $(ls -1 "$CONF_DIR" 2>/dev/null | wc -l) file(s)"
echo "Payloads     : $(find "$OBF_DIR" -name '*.js.b64' | wc -l) file(s)"
echo "Loader       : $PUBLIC_DIR/index.html"
echo "MITM loader  : $PUBLIC_DIR/scripts/mitm-loader.js"
echo "Manifest     : $PUBLIC_DIR/manifest.json"
echo "Catalog      : $PUBLIC_DIR/catalog.html"
echo "✅ Build complete."
