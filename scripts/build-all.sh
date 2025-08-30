#!/usr/bin/env bash
set -euo pipefail
IFS=$'\n\t'

# ────────────────────────────────────────────────────────────────────────────────
# build-all.sh ─ Orchestrates config + payload builds
#   • Cleans old artifacts
#   • Runs all generators (conf / mobileconfig / mitm-loader)
#   • Obfuscates payloads into .js.b64 via npx/pnpm dlx
#   • Writes manifest.json
#   • Generates QR codes
# ────────────────────────────────────────────────────────────────────────────────

TOTAL_STEPS=9
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src-scripts"
PUBLIC_DIR="$ROOT_DIR/apps/loader/public"
CONF_DIR="$PUBLIC_DIR/configs"
OBF_DIR="$PUBLIC_DIR/obfuscated"
QR_DIR="$PUBLIC_DIR/qr"
BUILD_ID="$(date +%Y%m%d%H%M%S)"
GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo "dev-$BUILD_ID")"
export GIT_COMMIT

echo "🔧 build-all.sh started (commit: $GIT_COMMIT)"
echo "--------------------------------------"

# ─── Helpers ─────────────────────────────────────────────────────────────────
log(){ echo -e "\033[1;36m$1\033[0m"; }
warn(){ echo -e "\033[1;33m⚠️ $1\033[0m"; }
error(){ echo -e "\033[1;31m❌ $1\033[0m"; exit 1; }
success(){ echo -e "\033[1;32m✅ $1\033[0m"; }
separator(){ echo -e "\n\033[1;35m=== [$1/$TOTAL_STEPS] $2 ===\033[0m\n"; }

# Detect obfuscator command
if command -v npx &>/dev/null; then
  OBF_CMD="npx --yes javascript-obfuscator"
elif command -v pnpm &>/dev/null; then
  OBF_CMD="pnpm dlx javascript-obfuscator"
else
  error "Neither npx nor pnpm found—cannot run javascript-obfuscator"
fi

# ─── 1. Clean ────────────────────────────────────────────────────────────────
separator 1 "Cleaning public artifacts"
rm -rf "$CONF_DIR" "$OBF_DIR" "$QR_DIR"
mkdir -p "$CONF_DIR" "$OBF_DIR" "$QR_DIR"

# ─── 2. Obfuscate payloads ──────────────────────────────────────────────────
separator 2 "Obfuscating JS payloads"
shopt -s globstar nullglob
js_files=( "$SRC_DIR"/**/*.js )
if [[ ${#js_files[@]} -eq 0 ]]; then
  warn "No JS payloads found"
else
  for file in "${js_files[@]}"; do
    [[ -s "$file" ]] || { warn "Skipping empty: $file"; continue; }
    name="$(basename "$file" .js)"
    obf="$OBF_DIR/${name}.ob.js"
    b64="$OBF_DIR/${name}.js.b64"
    log "🔒 $file → $b64"
    $OBF_CMD "$file" --output "$obf" \
      --compact true \
      --self-defending true \
      --control-flow-flattening true \
      --disable-console-output true \
      --string-array true \
      --string-array-encoding base64 \
      || { warn "Obfuscation failed: $file"; continue; }
    base64 "$obf" > "$b64"
    [[ -s "$b64" ]] || { warn "B64 empty: $b64"; continue; }
  done
fi
shopt -u globstar nullglob

# ─── 3. MITM loader & manifest ──────────────────────────────────────────────
separator 3 "Generating MITM loader & manifest"
node scripts/gen-mitm-loader.js \
  --hash="$GIT_COMMIT" \
  --version="$(node -p "require('./package.json').version")" \
  --date="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# ─── 4. Shadowrocket config ────────────────────────────────────────────────
separator 4 "Generate Shadowrocket config"
node scripts/gen-shadowrocket.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/shadowrocket.conf" \
  --emit-json --annotate --split-rules --final-group US

# ─── 5. Stash config ────────────────────────────────────────────────────────
separator 5 "Generate Stash config"
node scripts/gen-stash.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/stash.conf" \
  --final-group US

# ─── 6. Loon config ────────────────────────────────────────────────────────
separator 6 "Generate Loon config"
node scripts/gen-loon.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/loon.conf" \
  --final-group US

# ─── 7. Tunna config ───────────────────────────────────────────────────────
separator 7 "Generate Tunna config"
node scripts/gen-tunna.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/tunna.conf" \
  --final-group US

# ─── 8. iOS mobileconfig ──────────────────────────────────────────────────
separator 8 "Generate Mobileconfig"
node scripts/gen-mobileconfig.js \
  --input "$CONF_DIR/shadowrocket.conf" \
  --output "$PUBLIC_DIR/shadow_config.mobileconfig" \
  --group-name "PopdeuxRem US"

# ─── 9. QR codes ───────────────────────────────────────────────────────────
separator 9 "Generate QR codes"
if command -v qrcode-terminal &>/dev/null; then
  qrcode-terminal "$PUBLIC_DIR/shadow_config.mobileconfig" > "$QR_DIR/shadowrocket.txt"
  qrcode-terminal "$CONF_DIR/stash.conf" > "$QR_DIR/stash.txt"
else
  warn "qrcode-terminal not found, skipping QR codes"
fi

success "Build complete (commit: $GIT_COMMIT)"
