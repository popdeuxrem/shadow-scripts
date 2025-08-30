#!/bin/bash

set -e

echo "🔧 build-all.sh started"
echo "--------------------------------------"

# Config
SRC_DIR="src-scripts"
OUT_DIR="apps/loader/public"
COMMIT=$(git rev-parse --short HEAD)
export GIT_COMMIT="$COMMIT"

# Utilities
check_bin() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌ Required command not found: $1"
    exit 1
  fi
}

# Stage 1: Cleanup
echo "🧹 [1/9] Cleaning public artifacts"
rm -rf "$OUT_DIR/configs" "$OUT_DIR/qr" "$OUT_DIR/*.conf" "$OUT_DIR/*.mobileconfig"
mkdir -p "$OUT_DIR/configs" "$OUT_DIR/qr"

# Stage 2: Obfuscate Payloads
echo "🔐 [2/9] Obfuscating JS payloads"
check_bin javascript-obfuscator
node scripts/obfuscate-payloads.js

# Stage 3: Generate MITM Loader (HTML + manifest)
echo "📡 [3/9] Generating MITM loader & manifest"
node scripts/gen-mitm-loader.js

# Stage 4: Generate Shadowrocket config
echo "📱 [4/9] Generate Shadowrocket config"
node scripts/gen-shadowrocket.js \
  --input configs/master-rules.yaml \
  --output "$OUT_DIR/configs/shadowrocket.conf" \
  --emit-json --annotate --split-rules --final-group US

# Stage 5: Generate Stash config
echo "🌐 [5/9] Generate Stash config"
node scripts/gen-stash.js \
  --input configs/master-rules.yaml \
  --output "$OUT_DIR/configs/stash.yaml" \
  --final-group US

# Stage 6: Generate Loon config
echo "📲 [6/9] Generate Loon config"
node scripts/gen-loon.js \
  --input configs/master-rules.yaml \
  --output "$OUT_DIR/configs/loon.conf" \
  --final-group US

# Stage 7: Generate Tunna config
echo "🌍 [7/9] Generate Tunna config"
node scripts/gen-tunna.js \
  --input configs/master-rules.yaml \
  --output "$OUT_DIR/configs/tunna.conf" \
  --final-group US

# Stage 8: Generate iOS mobileconfig profile
echo "🧾 [8/9] Generate Mobileconfig"
node scripts/gen-mobileconfig.js \
  --input "$OUT_DIR/configs/shadowrocket.conf" \
  --output "$OUT_DIR/shadow_config.mobileconfig" \
  --group-name "PopdeuxRem US"

# Stage 9: Generate QR codes for all configs
echo "📸 [9/9] Generate QR codes"
pnpm dlx qrcode-terminal "$OUT_DIR/shadow_config.mobileconfig" > "$OUT_DIR/qr/shadowrocket.txt"
pnpm dlx qrcode-terminal "$OUT_DIR/configs/stash.yaml" > "$OUT_DIR/qr/stash.txt"

# Done
echo "✅ Build complete (commit: $COMMIT)"
