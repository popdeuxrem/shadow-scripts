#!/usr/bin/env bash
# scripts/build-all.sh
# Orchestrates: configs → obfuscation → manifest/catalog → loader → validation
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
  die "javascript-obfuscator not available and no npx/pnpm found"
}
OBF_CMD="$(pick_obfuscator)"

node_or_die() { have node || die "node not found"; }

ensure_dirs() {
  rm -rf "$CONF_DIR" "$OBF_DIR"
  mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"
}

run_if_exists() {
  local f="$1"; shift || true
  if [[ -f "$f" ]]; then node "$f" "$@"; else echo "↷ skip (missing): $f"; fi
}

list_b64() {
  # Print base64 filenames (one per line) or nothing if none
  if compgen -G "$OBF_DIR/*.js.b64" >/dev/null; then
    (cd "$OBF_DIR" && printf "%s\n" *.js.b64)
  fi
}

write_manifest() {
  echo "=== [4/8] Regenerate manifest.json ==="
  if have jq; then
    if compgen -G "$OBF_DIR/*.js.b64" >/dev/null; then
      (cd "$OBF_DIR" && printf "%s\n" *.js.b64 | jq -R . | jq -s .) > "$PUBLIC_DIR/manifest.json"
    else
      echo "[]" > "$PUBLIC_DIR/manifest.json"
    fi
  else
    node - <<'NODE' "$OBF_DIR" "$PUBLIC_DIR/manifest.json"
const fs=require('fs'),p=require('path');
const dir=process.argv[2], out=process.argv[3];
let files=[];
try{ files=fs.readdirSync(dir).filter(f=>f.endsWith('.js.b64')).sort(); }catch{}
fs.mkdirSync(p.dirname(out),{recursive:true});
fs.writeFileSync(out, JSON.stringify(files,null,2)+"\n");
NODE
  fi
}

echo "=== [1/8] Clean outputs ==="
ensure_dirs

echo "=== [2/8] Generate platform configs ==="
export DNS_SERVER PREFER_GROUP
node_or_die
run_if_exists "scripts/gen-shadowrocket.js"
run_if_exists "scripts/gen-stash.js"
run_if_exists "scripts/gen-loon.js"
run_if_exists "scripts/gen-mobileconfig.js"

echo "=== [3/8] Obfuscate + Base64 encode payloads ==="
if [[ -d "$SRC_JS" ]] && compgen -G "$SRC_JS/*.js" >/dev/null; then
  while IFS= read -r SRC; do
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
  done < <(find "$SRC_JS" -type f -name '*.js' | sort)
else
  echo "↷ no src payloads found under $SRC_JS"
fi

write_manifest

echo "=== [5/8] Copy catalog.html ==="
if [[ -f scripts/catalog-template.html ]]; then
  cp scripts/catalog-template.html "$PUBLIC_DIR/catalog.html"
else
  echo "↷ skip (missing): scripts/catalog-template.html"
fi

echo "=== [6/8] Copy manifest loader → index.html ==="
if [[ -f scripts/manifest-loader.html ]]; then
  cp scripts/manifest-loader.html "$PUBLIC_DIR/index.html"
else
  echo "↷ skip (missing): scripts/manifest-loader.html"
fi

echo "=== [7/8] Validate build artifacts ==="
[[ -f "$PUBLIC_DIR/manifest.json" ]] || die "manifest.json missing"
[[ -s "$PUBLIC_DIR/manifest.json" ]] || die "manifest.json empty"
# If any .js.b64 exist, ensure none are zero-length
if compgen -G "$OBF_DIR/*.js.b64" >/dev/null; then
  while IFS= read -r f; do
    [[ -s "$f" ]] || die "Empty file detected: $f"
  done < <(find "$OBF_DIR" -type f -name '*.js.b64')
fi

echo "=== [8/8] Summary ==="
echo "Configs:"
ls -1 "$CONF_DIR" 2>/dev/null || true
count="$(list_b64 | wc -l || echo 0)"
echo "Obfuscated payloads: $count"
echo "Loader   : $PUBLIC_DIR/index.html"
echo "Manifest : $PUBLIC_DIR/manifest.json"
echo "Catalog  : $PUBLIC_DIR/catalog.html"
echo "✅ Build complete."
