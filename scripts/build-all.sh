#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────
# build-all.sh — Orchestrates config + payload builds
#   • Cleans old artifacts
#   • Runs all generators (conf / mobileconfig / mitm-loader)
#   • Obfuscates payloads into .js.b64
#   • Writes manifest.json
#   • Injects cache-busting commit hash
# ───────────────────────────────────────────────────────────────

set -euo pipefail
IFS=$'\n\t'

# ─── Functions ───────────────────────────────────────────────────────
log() { echo -e "\033[1;36m$1\033[0m"; }
warn() { echo -e "\033[1;33m⚠️ $1\033[0m"; }
error() { echo -e "\033[1;31m❌ $1\033[0m"; exit 1; }
success() { echo -e "\033[1;32m✅ $1\033[0m"; }
separator() { echo -e "\n\033[1;35m=== [$1/$TOTAL_STEPS] $2 ===\033[0m\n"; }
check_command() { command -v "$1" >/dev/null 2>&1 || error "Required command '$1' not found"; }

# ─── Configuration ──────────────────────────────────────────────────
TOTAL_STEPS=9
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src-scripts"
PUBLIC_DIR="$ROOT_DIR/apps/loader/public"
CONF_DIR="$PUBLIC_DIR/configs"
OBF_DIR="$PUBLIC_DIR/obfuscated"
TEMP_DIR="$(mktemp -d)"
BUILD_START=$(date +%s)

# ─── Environment validation ─────────────────────────────────────────
check_command node
check_command jq
check_command base64
check_command git

# detect obfuscator
if command -v javascript-obfuscator >/dev/null 2>&1; then
  OBFUSCATOR="javascript-obfuscator"
elif [[ -x "./node_modules/.bin/javascript-obfuscator" ]]; then
  OBFUSCATOR="./node_modules/.bin/javascript-obfuscator"
else
  warn "javascript-obfuscator not found, will fallback to pnpm dlx"
  OBFUSCATOR="pnpm dlx javascript-obfuscator"
fi

# ─── Metadata ───────────────────────────────────────────────────────
BUILD_ID="$(date +%Y%m%d%H%M%S)"
BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_COMMIT="$(git rev-parse --short HEAD)"
  GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
else
  GIT_COMMIT="dev-$BUILD_ID"
  GIT_BRANCH="unknown"
fi

VERSION="0.0.0"
if [[ -f "$ROOT_DIR/package.json" ]]; then
  VERSION=$(node -p "require('$ROOT_DIR/package.json').version || '0.0.0'" || echo "0.0.0")
fi

# ─── 1. Clean ──────────────────────────────────────────────────
separator 1 "Cleaning public artifacts"
rm -rf "$CONF_DIR" "$OBF_DIR"
mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"

# ─── 2. Config generators ──────────────────────────────────────
separator 2 "Generating configs"
GENERATORS=(gen-shadowrocket.js gen-stash.js gen-loon.js gen-mobileconfig.js)
for gen in "${GENERATORS[@]}"; do
  if [[ -f "$ROOT_DIR/scripts/$gen" ]]; then
    log "⚙️ Running $gen"
    node "$ROOT_DIR/scripts/$gen" || warn "Generator failed: $gen"
  fi
done

# ─── 3. Obfuscate payloads ─────────────────────────────────────
separator 3 "Obfuscating payloads"
shopt -s globstar nullglob
for file in "$SRC_DIR"/**/*.js; do
  base="$(basename "$file" .js)"
  obf="$OBF_DIR/${base}.ob.js"
  b64="$OBF_DIR/${base}.js.b64"

  log "🔒 Obfuscating $file → $b64"
  if $OBFUSCATOR "$file" \
      --output "$obf" \
      --compact true \
      --self-defending true \
      --control-flow-flattening true \
      --disable-console-output true \
      --string-array true \
      --string-array-encoding base64; then
    base64 "$obf" > "$b64"
    success "Obfuscated: $file"
  else
    warn "Obfuscation failed: $file"
  fi
done
shopt -u globstar nullglob

# ─── 4. Manifest ───────────────────────────────────────────────
separator 4 "Writing manifest.json"
MANIFEST_FILE="$PUBLIC_DIR/manifest.json"
FILES=$(ls "$OBF_DIR"/*.js.b64 2>/dev/null || echo "")
jq -n \
  --arg version "$VERSION" \
  --arg commit "$GIT_COMMIT" \
  --arg branch "$GIT_BRANCH" \
  --arg buildDate "$BUILD_DATE" \
  --argjson files "$(printf '%s\n' $FILES | jq -R . | jq -s .)" \
  '{version:$version, commit:$commit, branch:$branch, buildDate:$buildDate, files:$files}' \
  > "$MANIFEST_FILE"

# ─── 5. Loader assets ──────────────────────────────────────────
separator 5 "Generating mitm-loader.js"
if [[ -f "$ROOT_DIR/scripts/gen-mitm-loader.js" ]]; then
  node "$ROOT_DIR/scripts/gen-mitm-loader.js" --hash="$GIT_COMMIT" --version="$VERSION" --date="$BUILD_DATE"
fi

# ─── 6. Static templates ───────────────────────────────────────
separator 6 "Copying templates"
for tpl in manifest-loader.html catalog-template.html; do
  if [[ -f "$ROOT_DIR/scripts/$tpl" ]]; then
    target="$PUBLIC_DIR/${tpl/-template/}"
    cp "$ROOT_DIR/scripts/$tpl" "$target"
    sed -i.bak "s/{{VERSION}}/$VERSION/g; s/{{BUILD_DATE}}/$BUILD_DATE/g; s/{{COMMIT}}/$GIT_COMMIT/g" "$target"
    rm -f "$target.bak"
  fi
done

# ─── 7. Validation ─────────────────────────────────────────────
separator 7 "Validating artifacts"
find "$PUBLIC_DIR" -type f -empty -print && warn "Found empty files"

# ─── 8. Build info ─────────────────────────────────────────────
separator 8 "Creating build-info.json"
cat > "$PUBLIC_DIR/build-info.json" <<EOF
{
  "version": "$VERSION",
  "buildId": "$BUILD_ID",
  "buildDate": "$BUILD_DATE",
  "gitCommit": "$GIT_COMMIT",
  "gitBranch": "$GIT_BRANCH"
}
EOF

# ─── 9. Summary ────────────────────────────────────────────────
separator 9 "Build Summary"
log "📦 Version: $VERSION"
log "🔑 Commit: $GIT_COMMIT"
log "📂 Output: $PUBLIC_DIR"
success "Build complete."
