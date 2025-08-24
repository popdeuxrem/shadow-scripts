#!/usr/bin/env bash
# scripts/build-all.sh
# End-to-end pipeline:
# 1) generate configs  2) obfuscate payloads  3) manifest.json
# 4) mitm-loader.js    5) catalog.html        6) checksums + validation

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ---- Paths
PUBLIC_DIR="apps/loader/public"
CONF_DIR="$PUBLIC_DIR/configs"
OBF_DIR="$PUBLIC_DIR/obfuscated"
SCRIPTS_OUT_DIR="$PUBLIC_DIR/scripts"

# Payload sources. Add more dirs if you store payloads elsewhere.
# Only these are obfuscated; build/generator scripts are ignored.
PAYLOAD_DIRS=( "src-scripts" "scripts/payloads" "payloads" )

# ---- Env knobs (CI can override)
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
MOBILECONFIG_GROUP="${MOBILECONFIG_GROUP:-US}"

# ---- Utilities
die() { echo "❌ $*" >&2; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

pick_obfuscator() {
  if have npx;  then echo "npx --yes javascript-obfuscator"; return; fi
  if have pnpm; then echo "pnpm dlx javascript-obfuscator"; return; fi
  if have javascript-obfuscator; then echo "javascript-obfuscator"; return; fi
  die "javascript-obfuscator not available (install or ensure npx/pnpm present)"
}

b64_encode() {  # portable base64 (no wraps)
  # usage: b64_encode <infile> <outfile>
  awk 'BEGIN{RS="^$";ORS=""}{print}' "$1" | base64 | tr -d '\n' > "$2"
}

ensure_dirs() {
  rm -rf "$CONF_DIR" "$OBF_DIR"
  mkdir -p "$CONF_DIR" "$OBF_DIR" "$SCRIPTS_OUT_DIR"
}

write_manifest() {
  local out="$PUBLIC_DIR/manifest.json"
  if ls "$OBF_DIR"/*.js.b64 >/dev/null 2>&1; then
    if have jq; then
      (cd "$OBF_DIR" && printf "%s\n" *.js.b64 | jq -R . | jq -s .) > "$out"
    else
      node - <<'NODE' "$OBF_DIR" "$out"
        const fs=require('fs'),p=require('path');
        const dir=process.argv[2], out=process.argv[3];
        let list=[];
        try { list=fs.readdirSync(dir).filter(f=>f.endsWith('.js.b64')).sort(); } catch {}
        fs.writeFileSync(out, JSON.stringify(list,null,2)+"\n");
NODE
    fi
  else
    echo "[]" > "$out"
  fi
  [[ -s "$out" ]] || die "manifest.json empty"
}

write_mitm_loader_fallback() {
  # Minimal loader that reads manifest.json and injects all *.js.b64
  cat > "$SCRIPTS_OUT_DIR/mitm-loader.js" <<'JS'
(function(){
  const base = (document.currentScript && document.currentScript.src)
    ? document.currentScript.src.split('/scripts/')[0]
    : (location.origin + location.pathname.replace(/\/[^/]*$/, ''));

  const manifestURL = base + '/manifest.json';
  const obfBase = base + '/obfuscated/';

  function log(m){ try{ console.log('[MITM]', m); }catch(e){} }

  fetch(manifestURL, {cache:'no-store'})
    .then(r => { if(!r.ok) throw new Error('HTTP '+r.status); return r.json(); })
    .then(files => {
      if(!Array.isArray(files)) throw new Error('bad manifest');
      return Promise.all(files.map(async f => {
        const res = await fetch(obfBase + f, {cache:'no-store'});
        if(!res.ok) throw new Error('HTTP '+res.status+' '+f);
        const b64 = (await res.text()).trim();
        const decoded = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64,'base64').toString('utf8');
        const s = document.createElement('script');
        s.type = 'text/javascript';
        s.textContent = decoded;
        document.documentElement.appendChild(s);
        log('injected '+f);
      }));
    })
    .catch(err => log('failed: '+err.message));
})();
JS
}

copy_html_shells() {
  # index.html = manifest loader UI shell
  if [[ -f scripts/manifest-loader.html ]]; then
    cp scripts/manifest-loader.html "$PUBLIC_DIR/index.html"
  else
    # simple stub
    cat > "$PUBLIC_DIR/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>Loader</title>
<body><pre id="log">Manifest loader</pre><script src="./scripts/mitm-loader.js"></script></body>
HTML
  fi

  # catalog.html
  if [[ -f scripts/catalog-template.html ]]; then
    node scripts/gen-catalog.js || die "gen-catalog.js failed"
  else
    # simple catalog fallback
    {
      echo "<!doctype html><meta charset='utf-8'><title>Catalog</title><ul>"
      for f in "$OBF_DIR"/*.js.b64 2>/dev/null; do
        b="$(basename "$f")"
        echo "<li><a href=\"./obfuscated/$b\">$b</a></li>"
      done
      echo "</ul>"
    } > "$PUBLIC_DIR/catalog.html"
  fi
}

checksums() {
  if ls "$OBF_DIR"/*.js.b64 >/dev/null 2>&1; then
    (cd "$OBF_DIR" && sha256sum *.js.b64 > "$PUBLIC_DIR/checksums.txt" 2>/dev/null) \
      || (cd "$OBF_DIR" && shasum -a 256 *.js.b64 > "$PUBLIC_DIR/checksums.txt")
  else
    : # nothing to checksum
  fi
}

# -------------------- Build starts here --------------------

echo "=== [1/9] Clean ==="
ensure_dirs

echo "=== [2/9] Generate configs ==="
export DNS_SERVER MOBILECONFIG_GROUP
node scripts/gen-shadowrocket.js   || die "gen-shadowrocket.js failed"
node scripts/gen-loon.js           || die "gen-loon.js failed"
node scripts/gen-stash.js          || die "gen-stash.js failed"
node scripts/gen-mobileconfig.js   || echo "↷ gen-mobileconfig.js skipped (optional)"

echo "=== [3/9] Obfuscate payloads ==="
OBF_CMD="$(pick_obfuscator)"
found_any=false
for dir in "${PAYLOAD_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r SRC; do
    found_any=true
    base="$(basename "$SRC" .js)"
    obf="$OBF_DIR/$base.ob.js"
    b64="$OBF_DIR/$base.js.b64"
    $OBF_CMD "$SRC" \
      --output "$obf" \
      --compact true \
      --self-defending true \
      --control-flow-flattening true
    [[ -s "$obf" ]] || die "empty obfuscated JS: $obf"
    b64_encode "$obf" "$b64"
    [[ -s "$b64" ]] || die "empty base64: $b64"
  done < <(find "$dir" -type f -name '*.js' | LC_ALL=C sort)
done
if [[ "$found_any" == "false" ]]; then
  echo "↷ No payloads in: ${PAYLOAD_DIRS[*]}"
fi

echo "=== [4/9] manifest.json ==="
write_manifest

echo "=== [5/9] mitm-loader.js ==="
if [[ -f scripts/gen-mitm-loader.js ]]; then
  node scripts/gen-mitm-loader.js || die "gen-mitm-loader.js failed"
else
  write_mitm_loader_fallback
fi

echo "=== [6/9] HTML shells (index/catalog) ==="
copy_html_shells

echo "=== [7/9] Validate outputs ==="
[[ -s "$PUBLIC_DIR/index.html" ]]        || die "index.html missing/empty"
[[ -s "$PUBLIC_DIR/manifest.json" ]]     || die "manifest.json missing/empty"
[[ -f "$CONF_DIR/shadowrocket.conf" ]]   || die "shadowrocket.conf missing"
[[ -f "$CONF_DIR/loon.conf" ]]           || die "loon.conf missing"
[[ -f "$CONF_DIR/stash.conf" ]]          || die "stash.conf missing"
# if any payloads exist, ensure there are no zero-length b64 files
if ls "$OBF_DIR"/*.js.b64 >/dev/null 2>&1; then
  while IFS= read -r f; do
    [[ -s "$f" ]] || die "Empty payload: $f"
  done < <(find "$OBF_DIR" -type f -name '*.js.b64')
fi

echo "=== [8/9] checksums.txt ==="
checksums

echo "=== [9/9] Summary ==="
echo "Configs   : $CONF_DIR"
echo "Payloads  : $(ls -1 "$OBF_DIR"/*.js.b64 2>/dev/null | wc -l || true)"
echo "Loader    : $PUBLIC_DIR/index.html"
echo "Manifest  : $PUBLIC_DIR/manifest.json"
echo "MITM JS   : $SCRIPTS_OUT_DIR/mitm-loader.js"
echo "Catalog   : $PUBLIC_DIR/catalog.html"
[[ -f "$PUBLIC_DIR/checksums.txt" ]] && echo "Checksums : $PUBLIC_DIR/checksums.txt"
echo "✅ Done."
