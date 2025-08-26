#!/usr/bin/env bash
set -euo pipefail

# ─── folders ───────────────────────────────────────────────
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src-scripts"
CONF_DIR="$ROOT_DIR/apps/loader/public/configs"
OBF_DIR="$ROOT_DIR/apps/loader/public/obfuscated"
PUBLIC_DIR="$ROOT_DIR/apps/loader/public"

DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
export DNS_SERVER

die()  { echo -e "\n❌  $*\n" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

obf_cmd() {
  if have npx;  then echo "npx --yes javascript-obfuscator"; return; fi
  if have pnpm; then echo "pnpm dlx javascript-obfuscator"; return; fi
  die "❌ javascript-obfuscator CLI not available"
}
OBF="$(obf_cmd)"

run_if() { [[ -f "$1" ]] && node "$1" || echo "↷ skip: $(basename "$1")"; }

echo "=== [1/8] Clean outputs ==="
rm -rf -- "$CONF_DIR" "$OBF_DIR"
mkdir -p  -- "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"

echo "=== [2/8] Generate configs ==="
run_if "$ROOT_DIR/scripts/gen-shadowrocket.js"
run_if "$ROOT_DIR/scripts/gen-stash.js"
run_if "$ROOT_DIR/scripts/gen-loon.js"
run_if "$ROOT_DIR/scripts/gen-mobileconfig.js"

echo "=== [3/8] Obfuscate payloads ==="
shopt -s globstar nullglob
JS_LIST=( "$SRC_DIR"/**/*.js )

if [[ ${#JS_LIST[@]} -eq 0 ]]; then
  echo "↷ no payloads in $SRC_DIR"
else
  TMPDIR="$(mktemp -d)"
  export TMPDIR OBF OBF_DIR
  printf '%s\n' "${JS_LIST[@]}" \
  | xargs -P "$(nproc)" -I{} bash -c '
      JS="{}"
      base="${JS##*/}"
      obf="$OBF_DIR/${base%.js}.ob.js"
      b64="$OBF_DIR/${base%.js}.js.b64"

      $OBF "$JS" --output "$obf" \
        --compact true \
        --self-defending true \
        --control-flow-flattening true \
        --disable-console-output true \
        --string-array true \
        --string-array-encoding base64

      base64 "$obf" > "$b64"
      [[ -s "$b64" ]] || { echo "0-byte payload → $b64" >&2; rm -f "$b64"; exit 1; }
    '
  rm -rf "$TMPDIR"
fi
shopt -u globstar nullglob

echo "=== [4/8] Write manifest.json ==="
if have jq; then
  ( cd "$OBF_DIR" && printf '%s\n' *.js.b64 2>/dev/null | jq -R . | jq -s . ) \
    > "$PUBLIC_DIR/manifest.json"
else
  node - <<'NODE' "$OBF_DIR" "$PUBLIC_DIR/manifest.json"
    import { readdirSync, writeFileSync, mkdirSync } from 'fs';
    import { dirname } from 'path';
    const [dir,out]=process.argv.slice(2);
    let files=[];
    try{ files=readdirSync(dir).filter(f=>f.endsWith(".js.b64")).sort(); }catch{}
    mkdirSync(dirname(out),{recursive:true});
    writeFileSync(out, JSON.stringify(files,null,2)+"\n");
NODE
fi

echo "=== [5/8] Generate mitm-loader.js ==="
run_if "$ROOT_DIR/scripts/gen-mitm-loader.js"

echo "=== [6/8] Copy static templates ==="
cp -f "$ROOT_DIR/scripts/manifest-loader.html" "$PUBLIC_DIR/index.html"
cp -f "$ROOT_DIR/scripts/catalog-template.html"  "$PUBLIC_DIR/catalog.html"

echo "=== [7/8] Validate artefacts ==="
[[ -s "$PUBLIC_DIR/manifest.json" ]] || die "manifest.json missing/empty"
find "$PUBLIC_DIR" -type f \( -name '*.js' -o -name '*.json' \) -size 0 -print -quit |
  grep -q . && die "Zero-byte artefacts found"

echo "=== [8/8] Summary ==="
printf "Config files   : %d\n" "$(find "$CONF_DIR" -type f | wc -l)"
printf "Payloads (.b64): %d\n" "$(find "$OBF_DIR" -name '*.js.b64' | wc -l)"
echo   "manifest.json  : $PUBLIC_DIR/manifest.json"
echo   "index.html     : $PUBLIC_DIR/index.html"
echo   "catalog.html   : $PUBLIC_DIR/catalog.html"
echo "✅ Build complete."
