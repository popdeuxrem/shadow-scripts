#!/usr/bin/env bash
# Performance-optimized build pipeline with security hardening
# Designed for Linux environments with parallel processing
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# Configuration
PUBLIC_DIR="apps/loader/public"
CONF_DIR="$PUBLIC_DIR/configs"
OBF_DIR="$PUBLIC_DIR/obfuscated"
SCRIPTS_OUT="$PUBLIC_DIR/scripts"
CACHE_DIR=".build-cache"
PAYLOAD_DIRS=("src-scripts" "scripts/payloads" "payloads")

# Environment settings
DNS_SERVER="${DNS_SERVER:-1.1.1.1}"
MOBILECONFIG_GROUP="${MOBILECONFIG_GROUP:-US}"
VERSION=$(git describe --always --dirty 2>/dev/null || echo "dev")
TIMESTAMP=$(date -u +"%Y%m%d-%H%M%S")
BUILD_ID="${VERSION}-${TIMESTAMP}"
CPU_CORES=$(nproc 2>/dev/null || echo 2)
MAX_JOBS=$((CPU_CORES > 1 ? CPU_CORES - 1 : 1))

# Utilities with color output
BOLD="\033[1m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
BLUE="\033[34m"
RESET="\033[0m"
info() { echo -e "${BLUE}[INFO]${RESET} $*"; }
success() { echo -e "${GREEN}[SUCCESS]${RESET} $*"; }
warn() { echo -e "${YELLOW}[WARNING]${RESET} $*" >&2; }
error() { echo -e "${RED}[ERROR]${RESET} $*" >&2; }
die() { error "$*"; exit 1; }
have() { command -v "$1" >/dev/null 2>&1; }

# Optimized base64 encoder selection
setup_encoder() {
  if have base64; then
    b64() { base64 < "$1" | tr -d '\n' > "$2"; }
  else
    b64() { cat "$1" | perl -MMIME::Base64 -ne 'print encode_base64($_)' | tr -d '\n' > "$2"; }
  fi
}

# Find optimal obfuscator
pick_obfuscator() {
  if have npx; then 
    echo "npx --yes javascript-obfuscator"
    return
  fi
  if have pnpm; then 
    echo "pnpm dlx javascript-obfuscator" 
    return
  fi
  if have javascript-obfuscator; then 
    echo "javascript-obfuscator"
    return
  fi
  die "javascript-obfuscator not found. Install via npm/pnpm first."
}

# Setup directories with error handling
setup_dirs() {
  info "Setting up directory structure"
  rm -rf "$CONF_DIR" "$OBF_DIR" "$SCRIPTS_OUT"
  mkdir -p "$CONF_DIR" "$OBF_DIR" "$SCRIPTS_OUT" "$CACHE_DIR"
}

# Process a single JS file with caching
process_file() {
  local file="$1"
  local base=$(basename "$file" .js)
  local hash=$(sha256sum "$file" 2>/dev/null | cut -d' ' -f1 || shasum -a 256 "$file" | cut -d' ' -f1)
  local cache="$CACHE_DIR/${base}-${hash}.js.b64"
  
  # Use cached version if available
  if [[ -f "$cache" ]]; then
    cp "$cache" "$OBF_DIR/$base.js.b64"
    echo -e "${GREEN}✓${RESET} $base.js (cached)"
    return 0
  fi
  
  echo -e "${YELLOW}⚙${RESET} $base.js"
  
  # Apply advanced obfuscation
  "$OBF_CMD" "$file" --output "$OBF_DIR/$base.ob.js" \
    --compact true \
    --self-defending true \
    --control-flow-flattening true \
    --control-flow-flattening-threshold 0.7 \
    --string-array true \
    --string-array-encoding "rc4" \
    --string-array-threshold 0.8 \
    --dead-code-injection true \
    --dead-code-injection-threshold 0.4
  
  # Base64 encode
  b64 "$OBF_DIR/$base.ob.js" "$OBF_DIR/$base.js.b64"
  
  # Cache result
  cp "$OBF_DIR/$base.js.b64" "$cache"
  rm -f "$OBF_DIR/$base.ob.js"
  
  echo -e "${GREEN}✓${RESET} $base.js"
}

# Generate manifest with error checking
write_manifest() {
  local out="$PUBLIC_DIR/manifest.json"
  local temp_out="$PUBLIC_DIR/manifest.json.tmp"
  
  shopt -s nullglob
  local files=("$OBF_DIR"/*.js.b64)
  if ((${#files[@]})); then
    ( cd "$OBF_DIR" && printf '%s\n' *.js.b64 | jq -R . | jq -s . ) > "$temp_out"
  else
    echo "[]" > "$temp_out"
  fi
  shopt -u nullglob
  
  # Validate JSON before replacing
  if jq empty "$temp_out" 2>/dev/null; then
    mv "$temp_out" "$out"
    success "Manifest generated with $(jq length "$out") entries"
  else
    die "Generated invalid manifest.json"
  fi
}

# Generate optimized MITM loader with reliability features
gen_loader() {
  if [[ -f scripts/gen-mitm-loader.js ]]; then
    node scripts/gen-mitm-loader.js
  else
    cat > "$SCRIPTS_OUT/mitm-loader.js" <<'JS'
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
        const text = await res.text();
        inject(atob(text));
        return true;
      } catch (e) {
        if (i === retries) console.error(`Failed to load ${file}:`, e);
        else await new Promise(r => setTimeout(r, 200 * Math.pow(2, i)));
      }
    }
    return false;
  };
  
  // Batch processing for better performance
  const loadBatch = async (files, batchSize = 3) => {
    for (let i = 0; i < files.length; i += batchSize) {
      await Promise.all(
        files.slice(i, i + batchSize).map(file => loadScript(file))
      );
    }
  };
  
  // Main execution
  fetch(manifest, {cache: 'no-store'})
    .then(r => r.ok ? r.json() : Promise.reject(`Manifest error: ${r.status}`))
    .then(files => {
      if (!Array.isArray(files)) throw new Error('Invalid manifest format');
      return loadBatch(files);
    })
    .catch(e => console.error('[Loader]', e));
})();
JS
  fi
}

# Generate HTML with security headers
gen_html() {
  if [[ -f scripts/manifest-loader.html ]]; then
    cp scripts/manifest-loader.html "$PUBLIC_DIR/index.html"
  else
    cat > "$PUBLIC_DIR/index.html" << HTML
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
  fi
}

# Generate catalog with styling
gen_catalog() {
  if [[ -f scripts/gen-catalog.js ]]; then
    node scripts/gen-catalog.js
  else
    cat > "$PUBLIC_DIR/catalog.html" << HTML
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Script Catalog</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }
    h1 { margin-bottom: 1em; }
    ul { list-style: square; }
    footer { margin-top: 2em; color: #666; font-size: 0.9em; border-top: 1px solid #eee; padding-top: 1em; }
  </style>
</head>
<body>
  <h1>Script Catalog</h1>
  <ul>
HTML

    shopt -s nullglob
    for f in "$OBF_DIR"/*.js.b64; do
      base=$(basename "$f")
      echo "    <li><a href=\"./obfuscated/$base\">$base</a></li>" >> "$PUBLIC_DIR/catalog.html"
    done
    shopt -u nullglob

    cat >> "$PUBLIC_DIR/catalog.html" << HTML
  </ul>
  <footer>Build: ${BUILD_ID}</footer>
</body>
</html>
HTML
  fi
}

# Generate checksums for integrity verification
gen_checksums() {
  if ls "$OBF_DIR"/*.js.b64 &>/dev/null; then
    if have sha256sum; then
      (cd "$OBF_DIR" && sha256sum *.js.b64 > "$PUBLIC_DIR/checksums.txt")
    else
      (cd "$OBF_DIR" && shasum -a 256 *.js.b64 > "$PUBLIC_DIR/checksums.txt")
    fi
  fi
}

# Generate build info file
gen_build_info() {
  cat > "$PUBLIC_DIR/build-info.json" << JSON
{
  "version": "${VERSION}",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "dns": "${DNS_SERVER}",
  "stats": {
    "files": $(find "$OBF_DIR" -type f -name "*.js.b64" | wc -l),
    "totalSize": $(du -sb "$PUBLIC_DIR" 2>/dev/null | cut -f1 || echo 0)
  }
}
JSON
}

# ──────────────────────────────────────────────────────
# Main execution
# ──────────────────────────────────────────────────────

# Initialize
setup_encoder
OBF_CMD=$(pick_obfuscator)
export -f process_file b64 have

# Start build with timing
START_TIME=$(date +%s)
info "Starting build ${BOLD}${BUILD_ID}${RESET} (using $MAX_JOBS parallel jobs)"
setup_dirs

# Step 1: Generate configs
info "[1/8] Generating configs"
export DNS_SERVER MOBILECONFIG_GROUP
node scripts/gen-shadowrocket.js || die "Failed to generate Shadowrocket config"
node scripts/gen-loon.js || die "Failed to generate Loon config"
node scripts/gen-stash.js || die "Failed to generate Stash config"
[[ -f scripts/gen-mobileconfig.js ]] && node scripts/gen-mobileconfig.js || warn "Mobileconfig generation skipped"

# Step 2: Obfuscate scripts in parallel
info "[2/8] Obfuscating scripts"
found=false
for dir in "${PAYLOAD_DIRS[@]}"; do
  if [[ -d "$dir" ]]; then
    found=true
    files=$(find "$dir" -type f -name '*.js' | sort)
    if [[ -n "$files" ]]; then
      # Use GNU Parallel if available, otherwise xargs
      if have parallel; then
        echo "$files" | parallel --will-cite -j "$MAX_JOBS" process_file
      else
        echo "$files" | xargs -P "$MAX_JOBS" -I{} bash -c 'process_file "$@"' _ {}
      fi
    fi
  fi
done
$found || warn "No payload scripts found"

# Step 3-8: Generate output files
info "[3/8] Generating manifest"
write_manifest

info "[4/8] Creating loader script"
gen_loader

info "[5/8] Creating HTML"
gen_html

info "[6/8] Creating catalog"
gen_catalog

info "[7/8] Generating checksums"
gen_checksums

info "[8/8] Creating build info"
gen_build_info

# Calculate execution time
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Final validation
if [[ -s "$PUBLIC_DIR/index.html" && -s "$PUBLIC_DIR/manifest.json" ]]; then
  success "Build completed in ${DURATION}s → $PUBLIC_DIR"
  echo
  echo -e "${BOLD}Build Summary:${RESET}"
  echo -e "  Version:    ${BUILD_ID}"
  echo -e "  Files:      $(find "$OBF_DIR" -type f -name "*.js.b64" | wc -l)"
  echo -e "  Size:       $(du -sh "$PUBLIC_DIR" | cut -f1)"
  echo -e "  DNS Server: ${DNS_SERVER}"
else
  die "Build failed: Missing critical output files"
fi
