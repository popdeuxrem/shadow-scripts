#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────────────────────
#  build-all.sh  ─  End-to-end orchestrator
#     • cleans previous artefacts
#     • generates configs (Shadowrocket / Stash / Loon / mobileconfig)
#     • obfuscates every *.js under src-scripts/**  →  *.js.b64
#     • regenerates manifest.json, mitm-loader.js, catalog.html
#     • performs integrity checks
# ────────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ─── folders ──────────────────────────────────────────────────────────────────
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src-scripts"
CONF_DIR="$ROOT_DIR/apps/loader/public/configs"
OBF_DIR="$ROOT_DIR/apps/loader/public/obfuscated"
PUBLIC_DIR="$ROOT_DIR/apps/loader/public"
CACHE_DIR="$ROOT_DIR/.build-cache"

# ─── environment ──────────────────────────────────────────────────────────────
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"     # used by gen-mobileconfig.js
export DNS_SERVER
BUILD_VERSION="${BUILD_VERSION:-$(date +%Y%m%d)}"

# ─── helpers ──────────────────────────────────────────────────────────────────
die()  { echo -e "\n❌  $*\n" >&2; exit 1; }
warn() { echo -e "\n⚠️  $*\n" >&2; }
info() { echo -e "\033[36m$*\033[0m"; }
success() { echo -e "\033[32m✓ $*\033[0m"; }
have() { command -v "$1" >/dev/null 2>&1; }

# Get CPU count for optimal parallelism
get_cpu_count() {
  if have nproc; then
    nproc
  elif have sysctl && [[ "$(uname)" == "Darwin" ]]; then
    sysctl -n hw.ncpu
  else
    echo 2  # Safe default
  fi
}
PARALLEL_JOBS=$(get_cpu_count)
[[ $PARALLEL_JOBS -gt 1 ]] && PARALLEL_JOBS=$((PARALLEL_JOBS - 1))

# Find optimal obfuscator
obf_cmd() {
  if have npx; then 
    echo "npx --yes javascript-obfuscator"
    return
  fi
  if have pnpm; then 
    echo "pnpm dlx javascript-obfuscator" 
    return
  fi
  die "javascript-obfuscator CLI not available (install dev-dep in package.json)"
}
OBF="$(obf_cmd)"

# Base64 encode with platform detection
b64_encode() {
  if [[ "$(uname)" == "Darwin" ]]; then
    base64 -i "$1" > "$2"  # macOS variant
  else
    base64 "$1" > "$2"     # Linux and others
  fi
}

run_if() { 
  if [[ -f "$1" ]]; then
    info "Running $(basename "$1")..."
    if node "$1"; then
      success "$(basename "$1")"
      return 0
    else
      warn "$(basename "$1") failed"
      return 1
    fi
  else
    info "↷ skip: $(basename "$1") (not found)"
    return 0
  fi
}

# Check for required Node.js modules
check_node_modules() {
  local modules=("js-yaml" "javascript-obfuscator")
  for module in "${modules[@]}"; do
    if ! node -e "try { require.resolve('${module}'); } catch(e) { process.exit(1); }" 2>/dev/null; then
      warn "Missing Node.js module: ${module}"
      if [[ -n "${GITHUB_ACTIONS:-}" ]]; then
        info "Installing missing module in GitHub Actions..."
        npm install -g "${module}" || die "Failed to install ${module}"
      else
        die "Please install missing module: npm install -g ${module}"
      fi
    fi
  done
}

# ─── 1 · prepare ───────────────────────────────────────────────────────────────
info "=== [1/9] Preparing environment ==="
mkdir -p "$CACHE_DIR"
check_node_modules
node --version >/dev/null || die "Node.js unavailable"

# ─── 2 · clean ────────────────────────────────────────────────────────────────
info "=== [2/9] Clean outputs ==="
rm -rf -- "$CONF_DIR" "$OBF_DIR"
mkdir -p  -- "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"

# ─── 3 · configs ──────────────────────────────────────────────────────────────
info "=== [3/9] Generate configs ==="
run_if "$ROOT_DIR/scripts/gen-shadowrocket.js" || die "Failed to generate Shadowrocket config"
run_if "$ROOT_DIR/scripts/gen-stash.js" || die "Failed to generate Stash config"
run_if "$ROOT_DIR/scripts/gen-loon.js" || die "Failed to generate Loon config"
run_if "$ROOT_DIR/scripts/gen-mobileconfig.js"

# ─── 4 · obfuscate ────────────────────────────────────────────────────────────
info "=== [4/9] Obfuscate payloads ==="
shopt -s globstar nullglob
JS_LIST=( "$SRC_DIR"/**/*.js )
PROCESSED=0
FAILED=0

if [[ ${#JS_LIST[@]} -eq 0 ]]; then
  info "↷ no payloads in $SRC_DIR"
else
  info "Found ${#JS_LIST[@]} JavaScript files to process"
  
  # Process files individually with caching
  for JS in "${JS_LIST[@]}"; do
    # Ensure path is absolute and normalized
    JS=$(realpath "$JS" 2>/dev/null || echo "$JS")
    
    if [[ ! -f "$JS" || ! -r "$JS" ]]; then
      warn "File not accessible: $JS"
      FAILED=$((FAILED + 1))
      continue
    fi
    
    # Generate base filename and paths
    base=$(basename "$JS")
    base_no_ext=${base%.js}
    obf="$OBF_DIR/$base_no_ext.ob.js"
    b64="$OBF_DIR/$base_no_ext.js.b64"
    
    # Generate cache key based on file content
    if have sha256sum; then
      file_hash=$(sha256sum "$JS" | cut -d ' ' -f1)
    elif have shasum; then
      file_hash=$(shasum -a 256 "$JS" | cut -d ' ' -f1)
    else
      file_hash=$(stat -c %s_%Y "$JS" 2>/dev/null || stat -f %z_%m "$JS")
    fi
    
    cache_file="$CACHE_DIR/$base_no_ext-$file_hash.js.b64"
    
    # Use cache if available
    if [[ -f "$cache_file" ]]; then
      cp "$cache_file" "$b64"
      info "↷ Using cached: $base_no_ext"
      PROCESSED=$((PROCESSED + 1))
      continue
    fi
    
    info "Processing: $base"
    
    # Create temporary directory for each file
    tmp_dir=$(mktemp -d)
    tmp_js="$tmp_dir/$base"
    cp "$JS" "$tmp_js"
    
    # Run obfuscator with error handling
    if "$OBF" "$tmp_js" --output "$obf" \
      --compact true \
      --self-defending true \
      --control-flow-flattening true \
      --disable-console-output true \
      --string-array true \
      --string-array-encoding base64; then
      
      # Check if output was created
      if [[ -s "$obf" ]]; then
        # Base64 encode with error handling
        if b64_encode "$obf" "$b64" && [[ -s "$b64" ]]; then
          success "Processed: $base"
          # Cache successful result
          cp "$b64" "$cache_file"
          PROCESSED=$((PROCESSED + 1))
        else
          warn "Base64 encoding failed for: $base"
          rm -f "$b64"
          FAILED=$((FAILED + 1))
        fi
      else
        warn "Obfuscation output empty for: $base"
        FAILED=$((FAILED + 1))
      fi
    else
      warn "Obfuscation failed for: $base"
      FAILED=$((FAILED + 1))
    fi
    
    # Clean up temporary files
    rm -rf "$tmp_dir"
    rm -f "$obf"
  done
fi
shopt -u globstar nullglob

if [[ $FAILED -gt 0 ]]; then
  warn "$FAILED file(s) failed to process"
fi

if [[ $PROCESSED -eq 0 ]]; then
  warn "No files were successfully processed"
  # Create an empty manifest to prevent later steps from failing
  echo "[]" > "$PUBLIC_DIR/manifest.json"
fi

# ─── 5 · manifest & loader assets ─────────────────────────────────────────────
info "=== [5/9] Write manifest.json ==="
if have jq && [[ $PROCESSED -gt 0 ]]; then
  ( cd "$OBF_DIR" && printf '%s\n' *.js.b64 2>/dev/null | jq -R . | jq -s . ) \
    > "$PUBLIC_DIR/manifest.json"
else
  # Fallback manifest generation with Node.js
  node - <<'NODE' "$OBF_DIR" "$PUBLIC_DIR/manifest.json"
    const fs = require('fs');
    const path = require('path');
    const [dir,out] = process.argv.slice(2);
    let files = [];
    try { 
      files = fs.readdirSync(dir).filter(f => f.endsWith(".js.b64")).sort(); 
    } catch(e) { 
      console.error("Error reading directory:", e.message);
    }
    try {
      fs.mkdirSync(path.dirname(out), {recursive: true});
      fs.writeFileSync(out, JSON.stringify(files, null, 2) + "\n");
    } catch(e) {
      console.error("Error writing manifest:", e.message);
      process.exit(1);
    }
NODE
fi

info "=== [6/9] Generate mitm-loader.js ==="
mkdir -p "$PUBLIC_DIR/scripts"
run_if "$ROOT_DIR/scripts/gen-mitm-loader.js" || {
  # Fallback loader if script is missing
  cat > "$PUBLIC_DIR/scripts/mitm-loader.js" <<'JS'
(function(){
  'use strict';
  const base = (document.currentScript?.src || location.href).split('/scripts/')[0].replace(/\/$/, '');
  const manifest = `${base}/manifest.json`;
  const obfDir = `${base}/obfuscated/`;
  
  // Efficient script injection
  const inject = text => {
    const script = document.createElement('script');
    script.textContent = text;
    document.documentElement.appendChild(script);
  };
  
  // Load file with retry
  const loadScript = async (file, retries = 2) => {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await fetch(`${obfDir}${file}`, {
          cache: 'no-store',
          credentials: 'omit'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        inject(atob(await res.text()));
        return true;
      } catch (e) {
        if (i === retries) console.error(`Failed to load ${file}:`, e);
        else await new Promise(r => setTimeout(r, 250 * Math.pow(2, i)));
      }
    }
    return false;
  };
  
  // Main execution
  fetch(manifest, {cache: 'no-store'})
    .then(r => r.ok ? r.json() : Promise.reject(`Manifest error: ${r.status}`))
    .then(files => {
      if (!Array.isArray(files)) throw new Error('Invalid manifest format');
      return Promise.all(files.map(loadScript));
    })
    .catch(e => console.error('[Loader]', e));
})();
JS
  success "Generated fallback mitm-loader.js"
}

info "=== [7/9] Copy static templates ==="
if [[ -f "$ROOT_DIR/scripts/manifest-loader.html" ]]; then
  cp -f "$ROOT_DIR/scripts/manifest-loader.html" "$PUBLIC_DIR/index.html"
else
  # Create fallback index.html
  cat > "$PUBLIC_DIR/index.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Loader</title>
  <meta name="robots" content="noindex,nofollow">
  <meta http-equiv="X-Content-Type-Options" content="nosniff">
</head>
<body>
  <script src="./scripts/mitm-loader.js"></script>
</body>
</html>
HTML
  success "Generated fallback index.html"
fi

if [[ -f "$ROOT_DIR/scripts/catalog-template.html" ]]; then
  cp -f "$ROOT_DIR/scripts/catalog-template.html" "$PUBLIC_DIR/catalog.html"
else
  # Create fallback catalog.html
  cat > "$PUBLIC_DIR/catalog.html" <<HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Script Catalog</title>
  <style>body{font-family:system-ui,sans-serif;max-width:800px;margin:0 auto;padding:20px}</style>
</head>
<body>
  <h1>Script Catalog</h1>
  <ul>
HTML
  
  for f in "$OBF_DIR"/*.js.b64; do
    [[ -f "$f" ]] || continue
    base=$(basename "$f")
    echo "    <li><a href=\"./obfuscated/$base\">$base</a></li>" >> "$PUBLIC_DIR/catalog.html"
  done
  
  cat >> "$PUBLIC_DIR/catalog.html" <<HTML
  </ul>
  <footer>Build: ${BUILD_VERSION}</footer>
</body>
</html>
HTML
  success "Generated fallback catalog.html"
fi

# ─── 8 · build metadata ────────────────────────────────────────────────────────
info "=== [8/9] Generate build info ==="
cat > "$PUBLIC_DIR/build-info.json" <<JSON
{
  "version": "${BUILD_VERSION}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "dns": "${DNS_SERVER}",
  "stats": {
    "processed": ${PROCESSED},
    "failed": ${FAILED},
    "totalFiles": ${#JS_LIST[@]}
  }
}
JSON

# ─── 9 · validation ───────────────────────────────────────────────────────────
info "=== [9/9] Validate artifacts ==="
if [[ ! -s "$PUBLIC_DIR/manifest.json" ]]; then
  warn "manifest.json is empty or missing"
fi

EMPTY_FILES=$(find "$PUBLIC_DIR" -type f \( -name '*.js' -o -name '*.json' \) -size 0 -print)
if [[ -n "$EMPTY_FILES" ]]; then
  warn "Zero-byte artifacts found:"
  echo "$EMPTY_FILES"
else
  success "No zero-byte artifacts"
fi

# ─── summary ─────────────────────────────────────────────────────────────────
info "=== Summary ==="
printf "Config files   : %d\n" "$(find "$CONF_DIR" -type f 2>/dev/null | wc -l)"
printf "Payloads (.b64): %d of %d\n" "$PROCESSED" "${#JS_LIST[@]}"
echo   "manifest.json  : $PUBLIC_DIR/manifest.json"
echo   "index.html     : $PUBLIC_DIR/index.html"
echo   "catalog.html   : $PUBLIC_DIR/catalog.html"
echo   "build-info.json: $PUBLIC_DIR/build-info.json"

if [[ $FAILED -eq 0 ]]; then
  success "Build completed successfully"
  exit 0
else
  warn "$FAILED files failed to process, but build continued"
  [[ $PROCESSED -gt 0 ]] && exit 0 || exit 1
fi
