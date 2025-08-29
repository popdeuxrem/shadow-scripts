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
#
#  Author: PopduexRem
#  Updated: 2025-08-29 05:11:05 UTC
#  Version: 2.0.0

set -euo pipefail

# --- Configuration & Constants ---
readonly ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SRC_DIR="${ROOT_DIR}/src-scripts"
readonly PUBLIC_DIR="${ROOT_DIR}/apps/loader/public"
readonly CONF_DIR="${PUBLIC_DIR}/configs"
readonly PAYLOAD_DIR="${PUBLIC_DIR}/obfuscated"
readonly CACHE_DIR="${ROOT_DIR}/.build-cache"
readonly SCRIPTS_DIR="${ROOT_DIR}/scripts"
readonly LOGS_DIR="${ROOT_DIR}/.build-logs"

# Build metadata
readonly BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
readonly BUILD_VERSION=$(date -u +"%Y%m%d-%H%M%S")
readonly BUILD_ID="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "local")}"
readonly SESSION_ID="build-$(date +%s)-$$"
readonly BUILD_USER="PopduexRem"

# Performance settings (can be overridden via environment)
MAX_PARALLEL_JOBS="${BUILD_MAX_JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}"
CACHE_SIZE_LIMIT="${BUILD_CACHE_SIZE:-1073741824}"  # 1GB default
BUILD_TIMEOUT="${BUILD_TIMEOUT:-300}"  # 5 minutes

# Feature flags (can be overridden via CLI or environment)
ENABLE_WATCH_MODE="${BUILD_WATCH:-false}"
ENABLE_INTERACTIVE="${BUILD_INTERACTIVE:-false}"
ENABLE_NOTIFICATIONS="${BUILD_NOTIFICATIONS:-true}"
ENABLE_COMPRESSION="${BUILD_COMPRESSION:-true}"
ENABLE_SECURITY_SCAN="${BUILD_SECURITY_SCAN:-true}"
STRUCTURED_LOGGING="${BUILD_STRUCTURED_LOG:-false}"

# --- Logging & Helper Functions ---
# Color codes
readonly C_RESET='\033[0m'
readonly C_INFO='\033[36m'    # Cyan
readonly C_SUCCESS='\033[32m' # Green
readonly C_WARN='\033[33m'    # Yellow
readonly C_ERROR='\033[91m'   # Red
readonly C_BOLD='\033[1m'
readonly C_DEBUG='\033[90m'   # Gray
readonly C_PROGRESS='\033[35m' # Magenta

# Emoji support detection
EMOJI_SUPPORT="$(locale charmap 2>/dev/null | grep -qi utf && echo true || echo false)"
E_ROCKET="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "🚀" || echo "=>")"
E_CHECK="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "✓" || echo "OK")"
E_WARN="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "⚠️" || echo "WARN")"
E_ERROR="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "❌" || echo "ERROR")"
E_DEBUG="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "🔍" || echo "DEBUG")"

# Initialize logging
mkdir -p "$LOGS_DIR"
LOG_FILE="${LOGS_DIR}/${SESSION_ID}.log"

# Log functions
log_structured() {
  local level="$1" message="$2" component="${3:-main}" context="${4:-{}}"
  local timestamp="$(date -u +"%Y-%m-%dT%H:%M:%S.%3NZ")"
  
  if [[ "$STRUCTURED_LOGGING" == "true" ]]; then
    printf '{"timestamp":"%s","level":"%s","component":"%s","message":"%s","context":%s,"session_id":"%s"}\n' \
      "$timestamp" "$level" "$component" "$message" "$context" "$SESSION_ID" | tee -a "$LOG_FILE"
  else
    echo "[$timestamp] [$level] [$component] $message" >> "$LOG_FILE"
  fi
}

info() { 
  echo -e "${C_INFO}${E_ROCKET}${C_RESET} ${C_BOLD}$*${C_RESET}"
  log_structured "INFO" "$*"
}

success() { 
  echo -e "${C_SUCCESS} ${E_CHECK} ${C_RESET}$*"
  log_structured "INFO" "$*"
}

warn() { 
  echo -e "${C_WARN} ${E_WARN} ${C_RESET}$*" >&2
  log_structured "WARN" "$*"
}

debug() { 
  [[ "${DEBUG:-}" == "1" ]] && echo -e "${C_DEBUG}${E_DEBUG} ${C_DIM}$*${C_RESET}" >&2
  log_structured "DEBUG" "$*"
}

die() { 
  echo -e "\n${C_ERROR} ${E_ERROR} ERROR: $*${C_RESET}\n" >&2
  log_structured "ERROR" "$*"
  cleanup_on_exit
  exit 1
}

have() { 
  command -v "$1" &>/dev/null
}

# Progress indicator with percentage
show_progress() {
  local current="$1" total="$2" message="${3:-Processing}"
  local percent=$((current * 100 / total))
  local filled=$((percent / 2))
  local empty=$((50 - filled))
  
  printf "\r${C_PROGRESS}%s${C_RESET} [" "$message"
  printf "%*s" "$filled" | tr ' ' '█'
  printf "%*s" "$empty" | tr ' ' '░'
  printf "] %d%% (%d/%d)" "$percent" "$current" "$total"
  
  [[ "$current" -eq "$total" ]] && echo
}

# Utility functions
hash_content() {
  local file="$1"
  local stat_info
  stat_info="$(stat -c '%Y-%s' "$file" 2>/dev/null || stat -f '%m-%z' "$file" 2>/dev/null || echo "0-0")"
  echo "${stat_info}-$(sha256sum "$file" 2>/dev/null | cut -d' ' -f1 || md5sum "$file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")"
}

notify() {
  local title="$1" message="$2" urgency="${3:-normal}"
  
  if [[ "$ENABLE_NOTIFICATIONS" == "true" ]]; then
    if have notify-send; then
      notify-send -u "$urgency" "$title" "$message" 2>/dev/null || true
    elif have osascript; then
      osascript -e "display notification \"$message\" with title \"$title\"" 2>/dev/null || true
    fi
  fi
}

cleanup_on_exit() {
  local exit_code=$?
  
  if [[ $exit_code -ne 0 ]]; then
    warn "Build failed with exit code $exit_code"
    # Add any cleanup or rollback logic here
  fi
  
  # Cleanup temporary files if needed
  find "${TMPDIR:-/tmp}" -name "build-$$-*" -delete 2>/dev/null || true
  
  debug "Cleanup completed"
}

trap cleanup_on_exit EXIT INT TERM

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
  local failures=0
  local scripts=("gen-shadowrocket.js" "gen-stash.js" "gen-loon.js" "gen-mobileconfig.js")
  local total=${#scripts[@]}
  
  for i in "${!scripts[@]}"; do
    local script="${scripts[$i]}"
    show_progress $((i + 1)) "$total" "Generating configs"
    
    if [[ -f "${SCRIPTS_DIR}/${script}" ]]; then
      # Run script but don't exit on failure; log a warning instead.
      if timeout "$BUILD_TIMEOUT" node "${SCRIPTS_DIR}/${script}" --final-group US; then
        success "Generated ${script/gen-/}"
        ((generated++))
      else
        warn "Failed to generate ${script/gen-/}"
        ((failures++))
      fi
    fi
  done
  
  if ((generated == 0)) && ((failures == 0)); then 
    warn "No config generation scripts found or run."
  else
    success "Configuration generation: $generated/$((generated + failures)) successful"
  fi
}

# 4. Process a single JS payload: cache check -> encode -> cache store
process_payload() {
  local js_file="$1"
  local base_name
  base_name="$(basename "${js_file%.js}")"
  local encoded_file="${PAYLOAD_DIR}/${base_name}.js.b64"
  
  # Content-based cache key
  local content_hash
  content_hash="$(hash_content "$js_file")"
  local cache_key="payload-$content_hash"
  local cache_file="$CACHE_DIR/content/$cache_key"
  
  if [[ -f "$cache_file" ]]; then
    cp "$cache_file" "$encoded_file"
    echo "CACHE_HIT"
  else
    if [[ "$ENABLE_COMPRESSION" == "true" ]] && have gzip; then
      # Compress then encode
      if gzip -c "$js_file" | base64 > "$encoded_file.tmp" && mv "$encoded_file.tmp" "$encoded_file"; then
        cp "$encoded_file" "$cache_file"
        echo "BUILT_COMPRESSED"
      else
        echo "FAILED"
      fi
    else
      # Standard base64 encoding
      if base64 "$js_file" > "$encoded_file.tmp" && mv "$encoded_file.tmp" "$encoded_file"; then
        cp "$encoded_file" "$cache_file"
        echo "BUILT"
      else
        echo "FAILED"
      fi
    fi
  fi
}

export -f process_payload hash_content

# 5. Process all JS payloads in parallel
process_all_payloads() {
  info "Processing JavaScript Payloads"
  
  # Find all JavaScript files
  local js_files=()
  while IFS= read -r -d '' file; do
    js_files+=("$file")
  done < <(find "$SRC_DIR" -name "*.js" -type f -print0 2>/dev/null)
  
  if [[ ${#js_files[@]} -eq 0 ]]; then
    warn "No JavaScript files found in '$SRC_DIR'."
    return 0
  fi
  
  info "Found ${#js_files[@]} files. Processing with $MAX_PARALLEL_JOBS workers..."
  
  # Process files in parallel with progress tracking
  local temp_file
  temp_file="$(mktemp)"
  
  printf '%s\n' "${js_files[@]}" | \
    xargs -n 1 -P "$MAX_PARALLEL_JOBS" -I{} bash -c "process_payload '{}'" > "$temp_file"
  
  # Analyze results
  local built_count cache_count failed_count compressed_count
  built_count="$(grep -c "^BUILT$" "$temp_file" 2>/dev/null || echo 0)"
  cache_count="$(grep -c "^CACHE_HIT$" "$temp_file" 2>/dev/null || echo 0)"
  failed_count="$(grep -c "^FAILED$" "$temp_file" 2>/dev/null || echo 0)"
  compressed_count="$(grep -c "^BUILT_COMPRESSED$" "$temp_file" 2>/dev/null || echo 0)"
  
  rm -f "$temp_file"
  
  success "Payload processing completed:"
  echo "  • Total: ${#js_files[@]} files"
  echo "  • Built: $((built_count + compressed_count)) (compressed: $compressed_count)"
  echo "  • Cached: $cache_count"
  echo "  • Failed: $failed_count"
  
  if [[ $failed_count -gt 0 ]]; then
    die "$failed_count payload(s) failed to process."
  fi
}

# 6. Generate manifest, loaders, and static pages
generate_assets() {
  info "Generating Manifest and Static Assets"
  
  # Generate manifest.json
  if have jq; then
    (
      cd "$PAYLOAD_DIR" || exit 1
      printf '%s\n' *.js.b64 | jq -R . | jq -s . > "$PUBLIC_DIR/manifest.json"
    )
    success "Generated manifest.json"
  else
    warn "jq not found, generating simple manifest"
    (
      cd "$PAYLOAD_DIR" || exit 1
      printf '[\n' > "$PUBLIC_DIR/manifest.json"
      ls *.js.b64 2>/dev/null | sed 's/^\(.*\)$/  "\1",/' >> "$PUBLIC_DIR/manifest.json"
      sed -i '$s/,$//' "$PUBLIC_DIR/manifest.json" 2>/dev/null || true
      printf '\n]\n' >> "$PUBLIC_DIR/manifest.json"
    )
    success "Generated simple manifest.json"
  fi

  # Generate mitm-loader.js
  if [[ -f "${SCRIPTS_DIR}/gen-mitm-loader.js" ]]; then
    if node "${SCRIPTS_DIR}/gen-mitm-loader.js"; then
      success "Generated mitm-loader.js"
    else
      warn "Failed to generate mitm-loader.js"
    fi
  fi

  # Copy static HTML templates
  local templates=("manifest-loader.html:index.html" "catalog-template.html:catalog.html")
  for template in "${templates[@]}"; do
    local src="${template%%:*}"
    local dst="${template##*:}"
    if [[ -f "${SCRIPTS_DIR}/$src" ]]; then
      cp "${SCRIPTS_DIR}/$src" "${PUBLIC_DIR}/$dst"
      success "Copied $dst"
    else
      warn "Template not found: $src"
    fi
  done

  # Generate build-info.json
  if have jq; then
    jq -n \
      --arg version "$BUILD_VERSION" \
      --arg buildId "$BUILD_ID" \
      --arg timestamp "$BUILD_TIMESTAMP" \
      --argjson processed "$(find "$PAYLOAD_DIR" -type f | wc -l)" \
      --arg buildUser "$BUILD_USER" \
      '{version: $version, buildId: $buildId, timestamp: $timestamp, stats: {processed: $processed}, buildUser: $buildUser}' \
      > "$PUBLIC_DIR/build-info.json"
  else
    cat > "$PUBLIC_DIR/build-info.json" << EOF
{
  "version": "$BUILD_VERSION",
  "buildId": "$BUILD_ID",
  "timestamp": "$BUILD_TIMESTAMP",
  "stats": {
    "processed": $(find "$PAYLOAD_DIR" -type f | wc -l)
  },
  "buildUser": "$BUILD_USER"
}
EOF
  fi
  success "Generated build-info.json"
}

# 7. Validate the final artifacts
validate() {
  info "Validating Artifacts"
  local errors=0
  
  # Check for empty or invalid manifest
  if [[ -f "$PUBLIC_DIR/manifest.json" ]]; then
    if have jq && ! jq -e '. | length > 0' "$PUBLIC_DIR/manifest.json" >/dev/null; then
      warn "manifest.json is empty or invalid."
      ((errors++))
    fi
  else
    warn "manifest.json is missing."
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
  notify "Build Complete" "Build finished in ${duration}s" "normal"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      cat << EOF
Usage: $(basename "$0") [OPTIONS]

Options:
  -h, --help          Show this help message and exit
  -c, --clean-only    Only clean artifacts without rebuilding
  -v, --verbose       Enable verbose output
  --no-cache          Disable caching
  --no-compression    Disable compression
EOF
      exit 0
      ;;
    -c|--clean-only)
      prepare
      clean
      exit 0
      ;;
    -v|--verbose)
      DEBUG=1
      ;;
    --no-cache)
      rm -rf "$CACHE_DIR/content" 2>/dev/null
      mkdir -p "$CACHE_DIR/content"
      ;;
    --no-compression)
      ENABLE_COMPRESSION="false"
      ;;
    *)
      warn "Unknown option: $1"
      exit 1
      ;;
  esac
  shift
done

# Run the main function
main
