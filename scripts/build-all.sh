#!/usr/bin/env bash
# scripts/build-all.sh
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

die() { echo "❌ $*" >&2; exit 1; }
have(){ command -v "$1" >/dev/null 2>&1; }

pick_obfuscator() {
  if have npx;  then echo "npx --yes javascript-obfuscator"; return; fi
  if have pnpm; then echo "pnpm dlx javascript-obfuscator"; return; fi
  if have javascript-obfuscator; then echo "javascript-obfuscator"; return; fi
  die "javascript-obfuscator missing"
}
OBF_CMD="$(pick_obfuscator)"

b64_encode() { awk 'BEGIN{RS="^$";ORS=""}{print}' "$1" | base64 | tr -d '\n' > "$2"; }

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
      node - "$OBF_DIR" "$out" <<'NODE'
        const fs=require('fs'),dir=process.argv[2],out=process.argv[3];
        const list=fs.readdirSync(dir).filter(f=>f.endsWith('.js.b64')).sort();
        fs.writeFileSync(out, JSON.stringify(list,null,2)+"\n");
NODE
    fi
  else
    echo "[]" > "$out"
  fi
}

write_mitm_loader_fallback() {
  cat > "$SCRIPTS_OUT_DIR/mitm-loader.js" <<'JS'
(function(){
  const base = (document.currentScript?.src || location.href)
               .split('/scripts/')[0].replace(/\/$/, '');
  const manifestURL = base + '/manifest.json';
  const obfBase     = base + '/obfuscated/';

  const inject = txt => {
    const s=document.createElement('script');s.textContent=txt;
    document.documentElement.appendChild(s);
  };
  fetch(manifestURL,{cache:'no-store'})
   .then(r=>r.json())
   .then(async arr=>{
     if(!Array.isArray(arr)) throw new Error('bad manifest');
     for(const f of arr){
       const res=await fetch(obfBase+f,{cache:'no-store'});
       const b64=await res.text(); inject(atob(b64.trim()));
     }
   })
   .catch(e=>console.warn('[MITM]',e.message));
})();
JS
}

copy_html_shells() {
  cp scripts/manifest-loader.html "$PUBLIC_DIR/index.html" 2>/dev/null || {
    cat > "$PUBLIC_DIR/index.html" <<'HTML'
<!doctype html><meta charset="utf-8"><title>Loader</title>
<body><script src="./scripts/mitm-loader.js"></script></body>
HTML
  }
  node scripts/gen-catalog.js || {
    { echo "<!doctype html><ul>";
      for f in "$OBF_DIR"/*.js.b64 2>/dev/null; do
        b=$(basename "$f"); echo "<li><a href=\"./obfuscated/$b\">$b</a></li>";
      done
      echo "</ul>";
    } > "$PUBLIC_DIR/catalog.html"
  }
}

checksums() {
  if ls "$OBF_DIR"/*.js.b64 >/dev/null 2>&1; then
    (cd "$OBF_DIR" && sha256sum *.js.b64 > "$PUBLIC_DIR/checksums.txt" 2>/dev/null)\
      || (cd "$OBF_DIR" && shasum -a 256 *.js.b64 > "$PUBLIC_DIR/checksums.txt")
  fi
}

# ---------------- Build ----------------
echo "[1/9] Clean"; ensure_dirs
echo "[2/9] Configs"; export DNS_SERVER MOBILECONFIG_GROUP
node scripts/gen-shadowrocket.js   || die gen-shadowrocket
node scripts/gen-loon.js           || die gen-loon
node scripts/gen-stash.js          || die gen-stash
node scripts/gen-mobileconfig.js   || echo "↷ mobileconfig skipped"

echo "[3/9] Obfuscate"
found=false
for dir in "${PAYLOAD_DIRS[@]}"; do
  [[ -d "$dir" ]] || continue
  while IFS= read -r SRC; do
    found=true
    base=$(basename "$SRC" .js)
    obf="$OBF_DIR/$base.ob.js"; b64="$OBF_DIR/$base.js.b64"
    $OBF_CMD "$SRC" --output "$obf" --compact true --self-defending true --control-flow-flattening true
    b64_encode "$obf" "$b64"
  done < <(find "$dir" -type f -name '*.js' | sort)
done
$found || echo "↷ no payloads"

echo "[4/9] manifest.json"; write_manifest
echo "[5/9] mitm-loader.js"
[[ -f scripts/gen-mitm-loader.js ]] && node scripts/gen-mitm-loader.js || write_mitm_loader_fallback
echo "[6/9] HTML shells"; copy_html_shells
echo "[7/9] Validate"
[[ -s "$PUBLIC_DIR/index.html" ]] || die index.html
[[ -s "$PUBLIC_DIR/manifest.json" ]] || die manifest.json
echo "[8/9] checksums"; checksums
echo "[9/9] Done → $PUBLIC_DIR"
