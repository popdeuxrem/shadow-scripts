#!/usr/bin/env bash
# scripts/build-all.sh ─ master orchestrator
# Steps: clean → configs → mobileconfig → obfuscate → manifest/loader → validate

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

CONF_DIR="apps/loader/public/configs"
OBF_DIR="apps/loader/public/obfuscated"
PUBLIC_DIR="apps/loader/public"
SRC_JS="src-scripts"

DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
PREFER_GROUP="${MOBILECONFIG_GROUP:-Proxy}"

die()  { printf '❌ %s\n' "$*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# ---------- obfuscator ----------
pick_obf() {
  if have npx;  then echo "npx --yes javascript-obfuscator"; return; fi
  if have pnpm; then echo "pnpm dlx javascript-obfuscator"; return; fi
  die "javascript-obfuscator not found"
}
OBF_CMD="$(pick_obf)"

# ---------- helpers ----------
ensure_dirs() {
  rm -rf "$CONF_DIR" "$OBF_DIR"
  mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"
}

node_if() { [[ -f "$1" ]] && node "$1"; }

json_manifest() {
  if have jq; then
    (cd "$OBF_DIR" && printf '%s\n' *.js.b64 2>/dev/null | jq -R . | jq -s .)
  else
    node - <<'NODE' "$OBF_DIR"
const fs=require('fs'),p=require('path');
const dir=process.argv[2];let a=[];
try{a=fs.readdirSync(dir).filter(f=>f.endsWith('.js.b64')).sort();}catch{}
console.log(JSON.stringify(a));
NODE
  fi
}

# ---------- 1. clean ----------
echo "=== [1/8] Clean outputs ==="
ensure_dirs

# ---------- 2. configs ----------
echo "=== [2/8] Generate configs ==="
export DNS_SERVER PREFER_GROUP
for f in gen-shadowrocket.js gen-stash.js gen-loon.js gen-mobileconfig.js; do
  node_if "scripts/$f" || echo "↷ $f skipped"
done

# ---------- 3. obfuscate ----------
echo "=== [3/8] Obfuscate scripts ==="
if compgen -G "$SRC_JS/*.js" >/dev/null; then
  find "$SRC_JS" -type f -name '*.js' | while read -r JS; do
    base="$(basename "$JS" .js)"
    "$OBF_CMD" "$JS" --output "$OBF_DIR/$base.ob.js" --compact true --self-defending true \
      --control-flow-flattening true --dead-code-injection true
    base64 "$OBF_DIR/$base.ob.js" > "$OBF_DIR/$base.js.b64"
  done
else
  echo "↷ no JS payloads"
fi

# ---------- 4. manifest ----------
echo "=== [4/8] Build manifest.json ==="
json_manifest > "$PUBLIC_DIR/manifest.json"

# ---------- 5. loader / catalog ----------
echo "=== [5/8] Loader & catalog ==="
[[ -f scripts/manifest-loader.html ]] && cp scripts/manifest-loader.html "$PUBLIC_DIR/index.html"
[[ -f scripts/catalog-template.html  ]] && cp scripts/catalog-template.html  "$PUBLIC_DIR/catalog.html"

# ---------- 6. optional HTML minify ----------
if have html-minifier && [[ -f "$PUBLIC_DIR/index.html" ]]; then
  html-minifier --collapse-whitespace --remove-comments \
    -o "$PUBLIC_DIR/index.html" "$PUBLIC_DIR/index.html"
fi

# ---------- 7. validate ----------
echo "=== [6/8] Validate ==="
[[ -s "$PUBLIC_DIR/manifest.json" ]] || die "manifest.json missing/empty"
find "$OBF_DIR" -type f -name '*.js.b64' -size 0 -print -quit | grep -q . && die "zero-byte b64"

# ---------- 8. summary ----------
echo "=== [7/8] Summary ==="
echo "Configs   :" && ls -1 "$CONF_DIR"
echo "Payloads  :" && ls -1 "$OBF_DIR" | wc -l
echo "Manifest  : $PUBLIC_DIR/manifest.json"
echo "Loader    : $PUBLIC_DIR/index.html"
echo "Catalog   : $PUBLIC_DIR/catalog.html"
echo "✅ Build complete"
