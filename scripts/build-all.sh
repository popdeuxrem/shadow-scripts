#!/usr/bin/env bash
#
# ────────────────────────────────────────────────────────────────────────────────
#  build-all.sh — High-Performance Build & Deployment Orchestrator
# ────────────────────────────────────────────────────────────────────────────────
#  This script automates the entire build process, including:
#    • Cleaning previous build artifacts.
#    • Generating configuration files for various clients (Shadowrocket, Stash, etc.).
#    • Processing and encoding JavaScript payloads in parallel for maximum speed.
#    • Caching build artifacts to avoid redundant work.
#    • Generating a manifest, loaders, and a static catalog page.
#    • Performing integrity checks to ensure build quality.
# ────────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# --- Configuration & Constants ---
readonly ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SRC_DIR="${ROOT_DIR}/src-scripts"
readonly PUBLIC_DIR="${ROOT_DIR}/apps/loader/public"
readonly CONF_DIR="${PUBLIC_DIR}/configs"
readonly PAYLOAD_DIR="${PUBLIC_DIR}/obfuscated"
readonly CACHE_DIR="${ROOT_DIR}/.build-cache"
readonly SCRIPTS_DIR="${ROOT_DIR}/scripts"

# Build metadata
readonly BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
readonly BUILD_VERSION=$(date -u +"%Y%m%d-%H%M%S")
readonly BUILD_ID="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "local")}"

# --- Logging & Helper Functions ---
# Color codes
readonly C_RESET='\033[0m'
readonly C_INFO='\033[36m'    # Cyan
readonly C_SUCCESS='\033[32m' # Green
readonly C_WARN='\033[33m'    # Yellow
readonly C_ERROR='\033[91m'   # Red
readonly C_BOLD='\033[1m'

# Log functions
info()    { echo -e "${C_INFO}==>${C_RESET} ${C_BOLD}$*${C_RESET}"; }
success() { echo -e "${C_SUCCESS} ✓ ${C_RESET}$*"; }
warn()    { echo -e "${C_WARN} ⚠️ ${C_RESET}$*" >&2; }
die()     { echo -e "\n${C_ERROR} ❌ ERROR: $*${C_RESET}\n" >&2; exit 1; }
have()    { command -v "$1" &>/dev/null; }

# --- Main Build Functions ---

# 1. Prepare environment and check dependencies
prepare() {
  info "Preparing Environment"
  # Check for required commands
  local deps=("node" "git" "base64")
  [[ "$(find "$PAYLOAD_DIR" -type f -name "*.js.b64" 2>/dev/null | wc -l)" -gt 0 ]] && deps+=("jq")
  for dep in "${deps[@]}"; do
    have "$dep" || die "'$dep' is not installed, but is required for the build."
  done

  # Create necessary directories
  mkdir -p "$PUBLIC_DIR" "$CONF_DIR" "$PAYLOAD_DIR" "$CACHE_DIR"
  success "Environment ready"
  echo "Build ID: ${BUILD_ID}"
}

# 2. Clean previous build artifacts
clean() {
  info "Cleaning Old Artifacts"
  # A targeted clean is safer than 'rm -rf' on the whole public dir
  find "$CONF_DIR" "$PAYLOAD_DIR" -mindepth 1 -delete
  success "Cleaned output directories"
}

# 3. Generate client-specific configuration files
generate_configs() {
  info "Generating Config Files"
  local generated=0
  for script in "gen-shadowrocket.js" "gen-stash.js" "gen-loon.js" "gen-mobileconfig.js"; do
    if [[ -f "${SCRIPTS_DIR}/${script}" ]]; then
      node "${SCRIPTS_DIR}/${script}" && { success "Generated ${script/gen-/}"; ((generated++)); }
    fi
  done
  ((generated == 0)) && warn "No config generation scripts found or run."
}

# 4. Process a single JS payload: cache check -> encode -> cache store
process_single_payload() {
  local js_file="$1"
  local base_name
  base_name=$(basename "${js_file%.js}")
  local encoded_file="${PAYLOAD_DIR}/${base_name}.js.b64"
  
  # Use git hash-object for a reliable content hash
  local file_hash
  file_hash=$(git hash-object "$js_file")
  local cache_file="${CACHE_DIR}/${base_name}-${file_hash}.js.b64"

  if [[ -f "$cache_file" ]]; then
    cp "$cache_file" "$encoded_file"
    echo "CACHE" # Signal cache hit
  else
    if base64 "$js_file" > "$encoded_file"; then
      cp "$encoded_file" "$cache_file"
      echo "BUILT" # Signal successful build
    else
      echo "FAILED" # Signal failure
    fi
  fi
}
export -f process_single_payload # Export for xargs

# 5. Process all JS payloads in parallel
process_all_payloads() {
  info "Processing JavaScript Payloads"
  shopt -s globstar nullglob
  local js_files=("$SRC_DIR"/**/*.js)
  shopt -u globstar nullglob

  if [[ ${#js_files[@]} -eq 0 ]]; then
    warn "No JavaScript files found in '$SRC_DIR'."
    return
  fi
  
  info "Found ${#js_files[@]} files. Processing in parallel..."
  
  # Use xargs for parallel execution. `nproc` gets core count.
  local results
  results=$(printf '%s\n' "${js_files[@]}" | xargs -n 1 -P "$(nproc 2>/dev/null || echo 4)" -I{} bash -c "process_single_payload '{}'")
  
  # Tally results
  local built_count failed_count cache_count
  built_count=$(grep -c "BUILT" <<< "$results" || true)
  failed_count=$(grep -c "FAILED" <<< "$results" || true)
  cache_count=$(grep -c "CACHE" <<< "$results" || true)

  success "Processed: ${#js_files[@]} | Built: $built_count | Cached: $cache_count | Failed: $failed_count"
  if (( failed_count > 0 )); then
    die "$failed_count payload(s) failed to process."
  fi
}

# 6. Generate manifest, loaders, and static pages
generate_assets() {
  info "Generating Manifest and Static Assets"
  
  # Generate manifest.json
  (
    cd "$PAYLOAD_DIR" || exit 1
    printf '%s\n' *.js.b64 | jq -R . | jq -s . > "$PUBLIC_DIR/manifest.json"
  )
  success "Generated manifest.json"

  # Generate mitm-loader.js
  [[ -f "${SCRIPTS_DIR}/gen-mitm-loader.js" ]] && node "${SCRIPTS_DIR}/gen-mitm-loader.js"
  success "Generated mitm-loader.js"

  # Copy static HTML templates
  cp "${SCRIPTS_DIR}/manifest-loader.html" "${PUBLIC_DIR}/index.html"
  cp "${SCRIPTS_DIR}/catalog-template.html" "${PUBLIC_DIR}/catalog.html"
  success "Copied static HTML pages"

  # Generate build-info.json
  jq -n \
    --arg version "$BUILD_VERSION" \
    --arg buildId "$BUILD_ID" \
    --arg timestamp "$BUILD_TIMESTAMP" \
    --argjson processed "$(find "$PAYLOAD_DIR" -type f | wc -l)" \
    '{version: $version, buildId: $buildId, timestamp: $timestamp, stats: {processed: $processed}}' \
    > "$PUBLIC_DIR/build-info.json"
  success "Generated build-info.json"
}

# 7. Validate the final artifacts
validate() {
  info "Validating Artifacts"
  local errors=0
  
  # Check for empty or invalid manifest
  if ! jq -e '. | length > 0' "$PUBLIC_DIR/manifest.json" >/dev/null; then
    warn "manifest.json is empty, invalid, or missing."
    ((errors++))
  fi
  
  # Check for zero-byte files
  local empty_files
  empty_files=$(find "$PUBLIC_DIR" -type f -size 0 -print)
  if [[ -n "$empty_files" ]]; then
    warn "Found zero-byte artifacts:"
    echo "$empty_files" >&2
    ((errors++))
  fi
  
  if ((errors > 0)); then
    die "Validation failed with $errors error(s)."
  else
    success "All artifacts validated successfully."
  fi
}

# --- Script Entrypoint ---
main() {
  # Cleanup on exit
  trap 'echo -e "\n${C_WARN}Build interrupted. Cleaning up...${C_RESET}"; exit 1' INT TERM
  
  local start_time
  start_time=$(date +%s)

  prepare
  clean
  generate_configs
  process_all_payloads
  generate_assets
  validate

  local end_time duration
  end_time=$(date +%s)
  duration=$((end_time - start_time))

  info "Build Complete!"
  echo -e "
${C_BOLD}┌──────────────────┬───────────────────────────────────────────┐${C_RESET}
${C_BOLD}│ Build Summary    │                                           │${C_RESET}
${C_BOLD}├──────────────────┼───────────────────────────────────────────┤${C_RESET}
${C_BOLD}│ Version          │${C_RESET} ${BUILD_VERSION}                     ${C_BOLD}│${C_RESET}
${C_BOLD}│ Git Commit       │${C_RESET} ${BUILD_ID}                                 ${C_BOLD}│${C_RESET}
${C_BOLD}│ Payloads         │${C_RESET} $(find "$PAYLOAD_DIR" -type f | wc -l) files generated                      ${C_BOLD}│${C_RESET}
${C_BOLD}│ Configs          │${C_RESET} $(find "$CONF_DIR" -type f | wc -l) files generated                       ${C_BOLD}│${C_RESET}
${C_BOLD}│ Total Duration   │${C_RESET} ${duration} seconds                               ${C_BOLD}│${C_RESET}
${C_BOLD}└──────────────────┴───────────────────────────────────────────┘${C_RESET}
"
  success "All artifacts are located in: $PUBLIC_DIR"
}

# Run the main function
main "$@"
