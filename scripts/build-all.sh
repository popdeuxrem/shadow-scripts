#!/usr/bin/env bash
# scripts/build-all.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONF_DIR="apps/loader/public/configs"
OBF_DIR="apps/loader/public/obfuscated"
PUBLIC_DIR="apps/loader/public"
SRC_JS="src-scripts"

DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
PREFER_GROUP="${MOBILECONFIG_GROUP:-US}"
MASTER_RULES="configs/master-rules.yaml"   # single source-of-truth

die()  { echo "❌ $*" >&2; exit 1; }
have() { command -v "$1" &>/dev/null; }

have node || die "node missing"
have pnpm || die "pnpm missing (enable corepack)"

OBF_CMD="pnpm dlx javascript-obfuscator"
$OBF_CMD --version >/dev/null || die "javascript-obfuscator not installed"

echo "=== [1/8] Clean outputs ==="
rm -rf "$CONF_DIR" "$OBF_DIR"
mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"

echo "=== [2/8] Generate platform configs ==="
export DNS_SERVER PREFER_GROUP MASTER_RULES
for gen in gen-shadowrocket.js gen-stash.js gen-loon.js gen-mobileconfig.js; do
  [[ -f "scripts/$gen" ]] && node "scripts/$gen" || echo "↷ skip: scripts/$gen"
done

echo "=== [3/8] Obfuscate + base64 payloads ==="
if compgen -G "$SRC_JS/*.js" >/dev/null; then
  find "$SRC_JS" -type f -name '*.js' | sort | while read -r SRC; do
    base=$(basename "$SRC" .js)
    obf="$OBF_DIR/$base.ob.js"
    b64="$OBF_DIR/$base.js.b64"
    $OBF_CMD "$SRC" --output "$obf" --compact true --self-defending true --control-flow-flattening true
    base64 "$obf" > "$b64"
    [[ -s "$b64" ]] || die "empty payload: $b64"
  done
fi

echo "=== [4/8] manifest.json ==="
if have jq; then
  (cd "$OBF_DIR" && ls *.js.b64 2>/dev/null | jq -R . | jq -s .) > "$PUBLIC_DIR/manifest.json"
else
  node - <<'NODE' "$OBF_DIR" "$PUBLIC_DIR/manifest.json"
    const fs=require('fs'),p=require('path');
    const dir=process.argv[2],out=process.argv[3];
    let f=[]; try{f=fs.readdirSync(dir).filter(x=>x.endsWith('.js.b64')).sort();}catch{}
    fs.mkdirSync(p.dirname(out),{recursive:true});
    fs.writeFileSync(out,JSON.stringify(f,null,2)+'\n');
NODE
fi

echo "=== [5/8] mitm-loader.js ==="
[[ -f scripts/gen-mitm-loader.js ]] && node scripts/gen-mitm-loader.js || die "gen-mitm-loader.js missing"

echo "=== [6/8] Copy static HTML ==="
cp -f scripts/catalog-template.html  "$PUBLIC_DIR/catalog.html"   2>/dev/null || true
cp -f scripts/manifest-loader.html   "$PUBLIC_DIR/index.html"     2>/dev/null || true

echo "=== [7/8] Validate artefacts ==="
[[ -s "$PUBLIC_DIR/manifest.json" ]] || die "manifest.json empty"
find "$OBF_DIR" -name '*.js.b64' -empty -print -quit | grep -q . && die "zero-byte .js.b64 detected"

echo "=== [8/8] Summary ==="
echo "configs : $(ls -1 "$CONF_DIR" 2>/dev/null | wc -l)"
echo "payloads: $(find "$OBF_DIR" -name '*.js.b64' | wc -l)"
echo "loader  : $PUBLIC_DIR/index.html"
echo "mitm    : $PUBLIC_DIR/scripts/mitm-loader.js"
echo "✅ build complete."
