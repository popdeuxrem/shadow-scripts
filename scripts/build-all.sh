#!/usr/bin/env bash
# scripts/build-all.sh ─ full pipeline
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PUBLIC_DIR="apps/loader/public"
CONF_DIR="$PUBLIC_DIR/configs"
OBF_DIR="$PUBLIC_DIR/obfuscated"
SCRIPTS_OUT_DIR="$PUBLIC_DIR/scripts"
PAYLOAD_DIRS=( "src-scripts" "scripts/payloads" "payloads" )

DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
MOBILECONFIG_GROUP="${MOBILECONFIG_GROUP:-US}"

die()  { echo "❌ $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

pick_obfuscator() {
  if have npx;  then echo "npx --yes javascript-obfuscator"; return; fi
  if have pnpm; then echo "pnpm dlx javascript-obfuscator"; return; fi
  if have javascript-obfuscator; then echo "javascript-obfuscator"; return; fi
  die "javascript-obfuscator not available"
}
OBF_CMD="$(pick_obfuscator)"

b64() { awk 'BEGIN{RS="^$";ORS=""}{print}' "$1" | base64 | tr -d '\n' > "$2"; }

ensure_dirs() {
  rm -rf "$CONF_DIR" "$OBF_DIR"
  mkdir -p "$CONF_DIR" "$OBF_DIR" "$SCRIPTS_OUT_DIR"
}

write_manifest() {
  local out="$PUBLIC_DIR/manifest.json"
  if ls "$OBF_DIR"/*.js.b64 >/dev/null 2>&1; then
    ( cd "$OBF_DIR" && printf '%s\n' *.js.b64 | jq -R . | jq -s . ) > "$out"
  else
    echo "[]" > "$out"
  fi
  [[ -s "$out" ]] || die "manifest.json empty"
}

write_mitm_loader_fallback() {
  cat > "$SCRIPTS_OUT_DIR/mitm-loader.js" <<'JS'
(function(){
  const base=(document.currentScript?.src||location.href).split('/scripts/')[0].replace(/\/$/,'');
  const manifest=base+'/manifest.json', obf=base+'/obfuscated/';
  const inject = t=>{const s=document.createElement('script');s.textContent=t;document.documentElement.appendChild(s);};
  fetch(manifest,{cache:'no-store'}).then(r=>r.json()).then(async f=>{
    if(!Array.isArray(f)) throw new Error('bad manifest');
    for(const file of f){const r=await fetch(obf+file,{cache:'no-store'});inject(atob(await r.text()));}
  }).catch(e=>console.warn('[MITM]',e));
})();
JS
}

copy_html_shells() {
  [[ -f scripts/manifest-loader.html ]] \
    && cp scripts/manifest-loader.html "$PUBLIC_DIR/index.html" \
    || printf '<!doctype html><meta charset=utf-8><body><script src="./scripts/mitm-loader.js"></script>' > "$PUBLIC_DIR/index.html"

  if [[ -f scripts/gen-catalog.js ]]; then
    node scripts/gen-catalog.js
  else
    {
      echo '<!doctype html><ul>'
      for f in "$OBF_DIR"/*.js.b64 2>/dev/null; do
        b=$(basename "$f"); echo "<li><a href=\"./obfuscated/$b\">$b</a></li>"
      done
      echo '</ul>'
    } > "$PUBLIC_DIR/catalog.html"
  fi
}

checksums() {
  if ls "$OBF_DIR"/*.js.b64 >/dev/null 2>&1; then
    ( cd "$OBF_DIR" && sha256sum *.js.b64 > "$PUBLIC_DIR/checksums.txt" 2>/dev/null ) \
      || ( cd "$OBF_DIR" && shasum -a 256 *.js.b64 > "$PUBLIC_DIR/checksums.txt" )
  fi
}

# ───────── build ─────────
echo "[1/9] clean"; ensure_dirs

echo "[2/9] configs"
export DNS_SERVER MOBILECONFIG_GROUP
node scripts/gen-shadowrocket.js || die gen-shadowrocket
node scripts/gen-loon.js         || die gen-loon
node scripts/gen-stash.js        || die gen-stash
[[ -f scripts/gen-mobileconfig.js ]] && node scripts/gen-mobileconfig.js || echo "↷ mobileconfig skipped"

echo "[3/9] obfuscate"
found=false
for d in "${PAYLOAD_DIRS[@]}"; do
  [[ -d "$d" ]] || continue
  while IFS= read -r f; do
    found=true; base=$(basename "$f" .js)
    $OBF_CMD "$f" --output "$OBF_DIR/$base.ob.js" --compact true --self-defending true --control-flow-flattening true
    b64 "$OBF_DIR/$base.ob.js" "$OBF_DIR/$base.js.b64"
  done < <(find "$d" -type f -name '*.js' | sort)
done
$found || echo "↷ no payloads"

echo "[4/9] manifest"; write_manifest
echo "[5/9] mitm-loader"; [[ -f scripts/gen-mitm-loader.js ]] && node scripts/gen-mitm-loader.js || write_mitm_loader_fallback
echo "[6/9] html shells"; copy_html_shells
echo "[7/9] validate"; [[ -s "$PUBLIC_DIR/index.html" && -s "$PUBLIC_DIR/manifest.json" ]] || die artefacts
echo "[8/9] checksums"; checksums
echo "[9/9] done → $PUBLIC_DIR"
