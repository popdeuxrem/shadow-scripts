#!/usr/bin/env bash
# build-all.sh — Full build pipeline for Shadow Scripts

set -euo pipefail
IFS=$'\n\t'

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src-scripts"
PUBLIC_DIR="$ROOT_DIR/apps/loader/public"
CONF_DIR="$PUBLIC_DIR/configs"
OBF_DIR="$PUBLIC_DIR/obfuscated"
BUILD_ID="$(date +%Y%m%d%H%M%S)"
BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
GIT_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || echo "dev-$BUILD_ID")"
VERSION=$(jq -r .version "$ROOT_DIR/package.json" 2>/dev/null || echo "0.0.0")

log() { echo -e "\033[1;36m$1\033[0m"; }
error() { echo -e "\033[1;31m❌ $1\033[0m"; exit 1; }

# 1. Clean
log "🧹 Cleaning public artifacts"
rm -rf "$CONF_DIR" "$OBF_DIR"
mkdir -p "$CONF_DIR" "$OBF_DIR"

# 2. Obfuscate JS payloads
log "🔐 Obfuscating JS payloads"
node scripts/obfuscate-payloads.js \
  --input "$SRC_DIR" \
  --output "$OBF_DIR" \
  --base-url "https://popdeuxrem.github.io/shadow-scripts/scripts"

# 3. Generate mitm-loader.js
log "⚙️ Generating mitm-loader.js"
node scripts/gen-mitm-loader.js \
  --output "$PUBLIC_DIR/scripts/mitm-loader.js" \
  --manifest "$PUBLIC_DIR/scripts/manifest.json" \
  --commit "$GIT_COMMIT" \
  --version "$VERSION" \
  --date "$BUILD_DATE"

# 4. Generate configurations
log "📦 Generating configs"
node scripts/gen-shadowrocket.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/shadowrocket.conf" \
  --emit-json --annotate --split-rules --final-group US

node scripts/gen-stash.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/stash.yaml"

node scripts/gen-loon.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/loon.conf"

node scripts/gen-tunna.js \
  --input configs/master-rules.yaml \
  --output "$CONF_DIR/tunna.conf"

node scripts/gen-mobileconfig.js

# 5. Manifest and Build Info
log "🗂️ Generating manifest.json and build-info.json"
ls "$OBF_DIR"/*.js.b64 > /dev/null 2>&1 || error "No payloads to manifest"
jq -n \
  --arg version "$VERSION" \
  --arg commit "$GIT_COMMIT" \
  --arg date "$BUILD_DATE" \
  --argjson files "$(ls "$OBF_DIR"/*.js.b64 | xargs -n1 basename | jq -R . | jq -s .)" \
  '{ version: $version, commit: $commit, buildDate: $date, files: $files }' \
  > "$PUBLIC_DIR/manifest.json"

jq -n \
  --arg version "$VERSION" \
  --arg commit "$GIT_COMMIT" \
  --arg date "$BUILD_DATE" \
  --arg payloads "$(ls "$OBF_DIR"/*.js.b64 | wc -l)" \
  --arg configs "$(find "$CONF_DIR" -type f | wc -l)" \
  '{ version: $version, commit: $commit, buildDate: $date, payloadCount: $payloads|tonumber, configCount: $configs|tonumber }' \
  > "$PUBLIC_DIR/build-info.json"

# 6. Copy HTML templates
log "🧾 Injecting HTML templates"
for file in manifest-loader.html catalog-template.html; do
  src="$ROOT_DIR/scripts/$file"
  dest="$PUBLIC_DIR/${file/.html/.html}"
  [[ -f $src ]] && cp "$src" "$dest"
  sed -i.bak "s/{{VERSION}}/$VERSION/g; s/{{BUILD_DATE}}/$BUILD_DATE/g; s/{{COMMIT}}/$GIT_COMMIT/g" "$dest"
  rm -f "${dest}.bak"
done

# 7. Generate QR codes
if command -v qrencode &>/dev/null; then
  log "📸 Generating QR codes"
  mkdir -p "$PUBLIC_DIR/qrcode"
  for config in "$CONF_DIR"/*; do
    qrencode -o "$PUBLIC_DIR/qrcode/$(basename "$config").png" \
      "https://popdeuxrem.github.io/shadow-scripts/configs/$(basename "$config")"
  done
fi

# 8. Complete
log "✅ Build complete: $(date)"
