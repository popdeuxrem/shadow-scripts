#!/usr/bin/env bash
# ───────────────────────────────────────────────────────────────
# build-all.sh ─ Orchestrates config + payload builds
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
TOTAL_STEPS=8
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_DIR="$ROOT_DIR/src-scripts"
PUBLIC_DIR="$ROOT_DIR/apps/loader/public"
CONF_DIR="$PUBLIC_DIR/configs"
OBF_DIR="$PUBLIC_DIR/obfuscated"
TEMP_DIR="$(mktemp -d)"
BUILD_START=$(date +%s)

# Environment validation
check_command node
check_command jq
check_command base64
check_command npx

# Parse arguments
VERBOSE=false
DEBUG=false
SKIP_OBFUSCATION=false
SKIP_VALIDATION=false

for arg in "$@"; do
  case $arg in
    --verbose) VERBOSE=true ;;
    --debug) DEBUG=true ;;
    --skip-obfuscation) SKIP_OBFUSCATION=true ;;
    --skip-validation) SKIP_VALIDATION=true ;;
    --help) 
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --verbose           Show verbose output"
      echo "  --debug             Enable debug mode (preserves temp files)"
      echo "  --skip-obfuscation  Skip the obfuscation step"
      echo "  --skip-validation   Skip final validation checks"
      echo "  --help              Show this help message"
      exit 0
      ;;
  esac
done

# Create build ID
BUILD_ID="$(date +%Y%m%d%H%M%S)"
BUILD_DATE="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# Determine commit hash for cache busting
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  GIT_COMMIT="$(git rev-parse --short HEAD)"
  GIT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
else
  GIT_COMMIT="dev-$BUILD_ID"
  GIT_BRANCH="unknown"
fi
export GIT_COMMIT
export GIT_BRANCH

# Capture version from package.json if available
if [[ -f "$ROOT_DIR/package.json" ]]; then
  VERSION=$(node -p "require('$ROOT_DIR/package.json').version" 2>/dev/null || echo "unknown")
else
  VERSION="0.0.0"
fi

log "🔁 Build started: $BUILD_ID"
log "📋 Configuration:"
log "   • Version:  $VERSION"
log "   • Commit:   $GIT_COMMIT"
log "   • Branch:   $GIT_BRANCH"
log "   • Date:     $BUILD_DATE"
$SKIP_OBFUSCATION && warn "   • Obfuscation will be skipped"
$SKIP_VALIDATION && warn "   • Validation will be skipped"

# Error handling and cleanup
trap 'status=$?; rm -rf "$TEMP_DIR"; [ $status -ne 0 ] && error "Build failed"; exit $status' EXIT
trap 'echo ""; error "Build interrupted"; exit 1' INT TERM

# ─── 1. Clean ──────────────────────────────────────────────────
separator 1 "Cleaning outputs"

if [[ -d "$PUBLIC_DIR" ]]; then
  log "🧹 Cleaning previous build artifacts..."
  rm -rf "$CONF_DIR" "$OBF_DIR"
  # Preserve any existing static assets
  find "$PUBLIC_DIR" -type f \( -name "*.js.b64" -o -name "manifest.json" \) -delete
else
  log "🏗️ Creating output directory structure..."
fi

mkdir -p "$CONF_DIR" "$OBF_DIR" "$PUBLIC_DIR"

# ─── 2. Config generators ──────────────────────────────────────
separator 2 "Generating configs"

GENERATORS=(gen-shadowrocket.js gen-stash.js gen-loon.js gen-mobileconfig.js)
SUCCESSFUL_GENERATORS=0
FAILED_GENERATORS=0

for gen in "${GENERATORS[@]}"; do
  if [[ -f "$ROOT_DIR/scripts/$gen" ]]; then
    log "⚙️ Running $gen ..."
    if node "$ROOT_DIR/scripts/$gen"; then
      SUCCESSFUL_GENERATORS=$((SUCCESSFUL_GENERATORS + 1))
    else
      warn "Generator failed: $gen"
      FAILED_GENERATORS=$((FAILED_GENERATORS + 1))
    fi
  else
    log "↷ Skipped missing generator: $gen"
  fi
done

log "📊 Generators: $SUCCESSFUL_GENERATORS succeeded, $FAILED_GENERATORS failed"
if [[ $FAILED_GENERATORS -gt 0 ]]; then
  warn "Some generators failed but build will continue"
fi

# ─── 3. Obfuscate payloads ─────────────────────────────────────
echo "=== [3/8] Obfuscating payloads ==="
shopt -s globstar nullglob
JS_FILES=( "$SRC_DIR"/**/*.js )
if [[ ${#JS_FILES[@]} -eq 0 ]]; then
  echo "⚠️ Warning: No JS payloads found in $SRC_DIR"
else
  for file in "${JS_FILES[@]}"; do
    # Validate file exists and is not empty
    if [[ ! -f "$file" ]]; then
      echo "❌ File doesn't exist: $file"
      continue
    fi
    
    if [[ ! -s "$file" ]]; then
      echo "❌ Empty file: $file"
      continue
    fi
    
    base="$(basename "$file" .js)"
    obf="$OBF_DIR/${base}.ob.js"
    b64="$OBF_DIR/${base}.js.b64"

    echo "🔒 Obfuscating $file → $b64"
    
    # Debug: output file info
    echo "  • File path: $file"
    echo "  • File size: $(wc -c < "$file") bytes"
    echo "  • Output path: $obf"
    
    # Ensure the file is actually JavaScript
    if ! head -n1 "$file" | grep -q -E '(^#!/.*node|^//|^/\*|^var |^let |^const |^import |^function |^class |^export )'; then
      echo "⚠️ Warning: File doesn't appear to be JavaScript: $file"
      # Display first few lines for debugging
      echo "  • File preview:"
      head -n 3 "$file" | sed 's/^/    /'
    fi

    # Run obfuscator with better error handling
    if npx javascript-obfuscator "$file" --output "$obf" \
      --compact true \
      --self-defending true \
      --control-flow-flattening true \
      --disable-console-output true \
      --string-array true \
      --string-array-encoding base64; then
      
      # Verify the output file exists and is not empty
      if [[ ! -f "$obf" ]]; then
        echo "❌ Obfuscation failed: Output file not created: $obf"
        continue
      fi
      
      if [[ ! -s "$obf" ]]; then
        echo "❌ Obfuscation produced empty file: $obf"
        continue
      fi
      
      # Base64 encode
      base64 "$obf" > "$b64"
      
      if [[ ! -s "$b64" ]]; then
        echo "❌ Base64 encoding failed for $obf"
        continue
      fi
      
      echo "✅ Successfully obfuscated and encoded: $file"
    else
      echo "❌ Obfuscation failed for $file, error code: $?"
      # Try to provide more details about the file
      file "$file"
    fi
  done
fi
shopt -u globstar nullglob

log "📊 Payloads: $PROCESSED_FILES processed, $FAILED_FILES failed"

# ─── 4. Manifest ───────────────────────────────────────────────
separator 4 "Writing manifest.json"

# Create manifest
MANIFEST_FILE="$PUBLIC_DIR/manifest.json"
log "📜 Generating manifest at $MANIFEST_FILE"

if [[ -d "$OBF_DIR" ]]; then
  (
    cd "$OBF_DIR"
    # Create file list with metadata
    FILES=$(ls *.js.b64 2>/dev/null || echo "")
    if [[ -n "$FILES" ]]; then
      # Create enhanced manifest with metadata
      echo "{
        \"version\": \"$VERSION\",
        \"commit\": \"$GIT_COMMIT\",
        \"branch\": \"$GIT_BRANCH\",
        \"buildDate\": \"$BUILD_DATE\",
        \"files\": $(ls *.js.b64 2>/dev/null | sort | jq -R . | jq -s .)
      }" | jq . > "$MANIFEST_FILE"
    else
      # Create empty manifest if no files
      echo "{
        \"version\": \"$VERSION\",
        \"commit\": \"$GIT_COMMIT\",
        \"branch\": \"$GIT_BRANCH\",
        \"buildDate\": \"$BUILD_DATE\",
        \"files\": []
      }" | jq . > "$MANIFEST_FILE"
      warn "No payload files found to include in manifest"
    fi
  )
else
  error "Output directory doesn't exist: $OBF_DIR"
fi

if [[ ! -s "$MANIFEST_FILE" ]]; then
  error "Failed to create manifest.json or it's empty"
fi

success "Manifest created with $(jq '.files | length' "$MANIFEST_FILE") files"

# ─── 5. Loader assets ──────────────────────────────────────────
separator 5 "Generating mitm-loader.js"

LOADER_GENERATOR="$ROOT_DIR/scripts/gen-mitm-loader.js"
if [[ -f "$LOADER_GENERATOR" ]]; then
  log "⚙️ Running MITM loader generator..."
  
  if node "$LOADER_GENERATOR" \
    --hash="$GIT_COMMIT" \
    --version="$VERSION" \
    --date="$BUILD_DATE"; then
    success "MITM loader generated"
  else
    error "Failed to generate MITM loader"
  fi
else
  warn "Skipped missing loader generator: $LOADER_GENERATOR"
fi

# ─── 6. Static templates ───────────────────────────────────────
separator 6 "Copying templates"

# Index template
INDEX_TEMPLATE="$ROOT_DIR/scripts/manifest-loader.html"
if [[ -f "$INDEX_TEMPLATE" ]]; then
  log "📄 Copying index template..."
  cp -f "$INDEX_TEMPLATE" "$PUBLIC_DIR/index.html"
  
  # Inject version and build info
  sed -i.bak "s/{{VERSION}}/$VERSION/g" "$PUBLIC_DIR/index.html"
  sed -i.bak "s/{{BUILD_DATE}}/$BUILD_DATE/g" "$PUBLIC_DIR/index.html"
  sed -i.bak "s/{{COMMIT}}/$GIT_COMMIT/g" "$PUBLIC_DIR/index.html"
  rm -f "$PUBLIC_DIR/index.html.bak"
  
  success "Index template processed"
else
  warn "Index template not found: $INDEX_TEMPLATE"
fi

# Catalog template
CATALOG_TEMPLATE="$ROOT_DIR/scripts/catalog-template.html"
if [[ -f "$CATALOG_TEMPLATE" ]]; then
  log "📄 Copying catalog template..."
  cp -f "$CATALOG_TEMPLATE" "$PUBLIC_DIR/catalog.html"
  
  # Inject version and build info
  sed -i.bak "s/{{VERSION}}/$VERSION/g" "$PUBLIC_DIR/catalog.html"
  sed -i.bak "s/{{BUILD_DATE}}/$BUILD_DATE/g" "$PUBLIC_DIR/catalog.html"
  sed -i.bak "s/{{COMMIT}}/$GIT_COMMIT/g" "$PUBLIC_DIR/catalog.html"
  rm -f "$PUBLIC_DIR/catalog.html.bak"
  
  success "Catalog template processed"
else
  warn "Catalog template not found: $CATALOG_TEMPLATE"
fi

# ─── 7. Validation ─────────────────────────────────────────────
separator 7 "Validating artifacts"

if [[ "$SKIP_VALIDATION" == true ]]; then
  warn "Skipping validation as requested"
else
  log "🔍 Checking for empty files..."
  EMPTY_FILES=$(find "$PUBLIC_DIR" -type f -empty | wc -l)
  
  if [[ $EMPTY_FILES -gt 0 ]]; then
    warn "Found $EMPTY_FILES empty files:"
    find "$PUBLIC_DIR" -type f -empty -exec echo "  - {}" \;
    warn "Build may be incomplete"
  else
    success "No empty files detected"
  fi
  
  log "🔍 Validating essential files..."
  REQUIRED_FILES=(
    "$PUBLIC_DIR/manifest.json"
    "$PUBLIC_DIR/index.html"
  )
  
  MISSING=0
  for file in "${REQUIRED_FILES[@]}"; do
    if [[ ! -f "$file" ]]; then
      warn "Missing required file: $file"
      MISSING=$((MISSING + 1))
    fi
  done
  
  if [[ $MISSING -eq 0 ]]; then
    success "All required files present"
  else
    warn "$MISSING required files are missing"
  fi
fi

# Create build info file
log "📝 Creating build-info.json..."
cat > "$PUBLIC_DIR/build-info.json" << EOF
{
  "version": "$VERSION",
  "buildId": "$BUILD_ID",
  "buildDate": "$BUILD_DATE",
  "gitCommit": "$GIT_COMMIT",
  "gitBranch": "$GIT_BRANCH",
  "payloadCount": $(ls "$OBF_DIR"/*.js.b64 2>/dev/null | wc -l),
  "configCount": $(find "$CONF_DIR" -type f 2>/dev/null | wc -l)
}
EOF

# ─── 8. Summary ────────────────────────────────────────────────
separator 8 "Build Summary"

BUILD_END=$(date +%s)
BUILD_DURATION=$((BUILD_END - BUILD_START))

# Format duration
if [[ $BUILD_DURATION -lt 60 ]]; then
  DURATION_STR="${BUILD_DURATION}s"
elif [[ $BUILD_DURATION -lt 3600 ]]; then
  MINUTES=$((BUILD_DURATION / 60))
  SECONDS=$((BUILD_DURATION % 60))
  DURATION_STR="${MINUTES}m ${SECONDS}s"
else
  HOURS=$((BUILD_DURATION / 3600))
  MINUTES=$(((BUILD_DURATION % 3600) / 60))
  DURATION_STR="${HOURS}h ${MINUTES}m"
fi

# Calculate sizes
TOTAL_SIZE=$(du -sh "$PUBLIC_DIR" | cut -f1)
PAYLOADS_SIZE=$(du -sh "$OBF_DIR" 2>/dev/null | cut -f1 || echo "0K")
CONFIGS_SIZE=$(du -sh "$CONF_DIR" 2>/dev/null | cut -f1 || echo "0K")

log "📊 Build Stats:"
log "   • Duration:  $DURATION_STR"
log "   • Version:   $VERSION (commit $GIT_COMMIT)"
log "   • Configs:   $(find "$CONF_DIR" -type f 2>/dev/null | wc -l) ($CONFIGS_SIZE)"
log "   • Payloads:  $(ls "$OBF_DIR"/*.js.b64 2>/dev/null | wc -l) ($PAYLOADS_SIZE)"
log "   • Total Size: $TOTAL_SIZE"
log "   • Manifest:  $PUBLIC_DIR/manifest.json"
log "   • Index:     $PUBLIC_DIR/index.html"

# Create a simple report
cat > "$PUBLIC_DIR/build-report.txt" << EOF
Shadow Scripts Build Report
==========================
Version:    $VERSION
Build ID:   $BUILD_ID
Build Date: $BUILD_DATE
Commit:     $GIT_COMMIT ($GIT_BRANCH)
Duration:   $DURATION_STR

Files Summary:
- Configs:   $(find "$CONF_DIR" -type f 2>/dev/null | wc -l) ($CONFIGS_SIZE)
- Payloads:  $(ls "$OBF_DIR"/*.js.b64 2>/dev/null | wc -l) ($PAYLOADS_SIZE)
- Total Size: $TOTAL_SIZE

Build completed at $(date)
EOF

success "Build complete. Output in $PUBLIC_DIR"

# Cleanup temp directory
if [[ "$DEBUG" != true ]]; then
  rm -rf "$TEMP_DIR"
else
  log "Debug mode: Temporary files preserved at $TEMP_DIR"
fi

exit 0
