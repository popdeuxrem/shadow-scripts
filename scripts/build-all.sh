#!/usr/bin/env bash
#
# ════════════════════════════════════════════════════════════════════════════════
#  build-all.sh — Enterprise-Grade Build & Deployment Orchestrator
# ════════════════════════════════════════════════════════════════════════════════
#  This script automates the entire build process with advanced features:
#    • Intelligent caching with content-based hashing
#    • Parallel processing with adaptive resource utilization
#    • Comprehensive error handling with automatic rollback
#    • Advanced security validation and integrity checks
#    • Real-time progress tracking and build analytics
#    • Multi-environment configuration support
#    • Structured logging for CI/CD integration
# ════════════════════════════════════════════════════════════════════════════════
#
#  Author: PopduexRem
#  Updated: 2025-08-29 04:59:33 UTC
#  Version: 2.0.0

set -euo pipefail

# ─── CONFIGURATION & CONSTANTS ─────────────────────────────────────────────────

readonly SCRIPT_VERSION="2.0.0"
readonly ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
readonly SRC_DIR="${ROOT_DIR}/src-scripts"
readonly PUBLIC_DIR="${ROOT_DIR}/apps/loader/public"
readonly CONF_DIR="${PUBLIC_DIR}/configs"
readonly PAYLOAD_DIR="${PUBLIC_DIR}/obfuscated"
readonly CACHE_DIR="${ROOT_DIR}/.build-cache"
readonly SCRIPTS_DIR="${ROOT_DIR}/scripts"
readonly LOGS_DIR="${ROOT_DIR}/.build-logs"
readonly BACKUP_DIR="${CACHE_DIR}/backups"
readonly TEMP_DIR="${CACHE_DIR}/temp"

# Build metadata
readonly BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
readonly BUILD_VERSION=$(date -u +"%Y%m%d-%H%M%S")
readonly BUILD_ID="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "local")}"
readonly SESSION_ID="build-$(date +%s)-$$"
readonly BUILD_USER="PopduexRem"

# Performance configuration
readonly CPU_CORES="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)"
readonly MAX_PARALLEL_JOBS="${BUILD_MAX_JOBS:-$CPU_CORES}"
readonly CACHE_SIZE_LIMIT="${BUILD_CACHE_SIZE:-1073741824}"  # 1GB default
readonly BUILD_TIMEOUT="${BUILD_TIMEOUT:-300}"  # 5 minutes

# Feature flags
readonly ENABLE_WATCH_MODE="${BUILD_WATCH:-false}"
readonly ENABLE_INTERACTIVE="${BUILD_INTERACTIVE:-false}"
readonly ENABLE_NOTIFICATIONS="${BUILD_NOTIFICATIONS:-true}"
readonly ENABLE_COMPRESSION="${BUILD_COMPRESSION:-true}"
readonly ENABLE_SECURITY_SCAN="${BUILD_SECURITY_SCAN:-true}"
readonly STRUCTURED_LOGGING="${BUILD_STRUCTURED_LOG:-false}"

# ─── TERMINAL STYLING & LOGGING ────────────────────────────────────────────────

# Color codes with TTY detection
if [[ -t 1 ]] && [[ "${NO_COLOR:-}" != "1" ]]; then
  readonly C_RESET='\033[0m'
  readonly C_BOLD='\033[1m'
  readonly C_DIM='\033[2m'
  readonly C_INFO='\033[36m'    # Cyan
  readonly C_SUCCESS='\033[32m' # Green
  readonly C_WARN='\033[33m'    # Yellow
  readonly C_ERROR='\033[91m'   # Red
  readonly C_DEBUG='\033[90m'   # Gray
  readonly C_PROGRESS='\033[35m' # Magenta
else
  readonly C_RESET='' C_BOLD='' C_DIM='' C_INFO='' C_SUCCESS='' C_WARN='' C_ERROR='' C_DEBUG='' C_PROGRESS=''
fi

# Emoji support detection
readonly EMOJI_SUPPORT="$(locale charmap 2>/dev/null | grep -qi utf && echo true || echo false)"
readonly E_ROCKET="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "🚀" || echo "=>")"
readonly E_CHECK="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "✓" || echo "OK")"
readonly E_WARN="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "⚠️" || echo "WARN")"
readonly E_ERROR="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "❌" || echo "ERROR")"
readonly E_DEBUG="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "🔍" || echo "DEBUG")"
readonly E_CACHE="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "📦" || echo "CACHE")"
readonly E_SECURITY="$([[ "$EMOJI_SUPPORT" == "true" ]] && echo "🛡️" || echo "SECURITY")"

# Initialize logging
readonly LOG_FILE="${LOGS_DIR}/${SESSION_ID}.log"
mkdir -p "$LOGS_DIR"

# Enhanced logging functions with structured output support
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

error() {
  echo -e "${C_ERROR} ${E_ERROR} ${C_RESET}$*" >&2
  log_structured "ERROR" "$*"
}

debug() {
  [[ "${DEBUG:-}" == "1" ]] && echo -e "${C_DEBUG}${E_DEBUG} ${C_DIM}$*${C_RESET}" >&2
  log_structured "DEBUG" "$*"
}

die() {
  error "FATAL: $*"
  log_structured "FATAL" "$*"
  cleanup_on_exit
  exit 1
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

# ─── UTILITY FUNCTIONS ─────────────────────────────────────────────────────────

have() {
  command -v "$1" &>/dev/null
}

# Enhanced content hashing with file metadata
hash_content() {
  local file="$1"
  local stat_info
  stat_info="$(stat -c '%Y-%s' "$file" 2>/dev/null || stat -f '%m-%z' "$file" 2>/dev/null || echo "0-0")"
  echo "${stat_info}-$(sha256sum "$file" 2>/dev/null | cut -d' ' -f1 || md5sum "$file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")"
}

# System resource monitoring
get_system_resources() {
  local cpu_count memory_gb disk_gb
  cpu_count="$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 1)"
  memory_gb="$(awk '/MemTotal/ {printf "%.1f", $2/1024/1024}' /proc/meminfo 2>/dev/null || echo "4.0")"
  disk_gb="$(df "$ROOT_DIR" | awk 'NR==2 {printf "%.1f", $4/1024/1024}' 2>/dev/null || echo "10.0")"
  
  printf '{"cpu_cores":%d,"memory_gb":%s,"disk_available_gb":%s}' "$cpu_count" "$memory_gb" "$disk_gb"
}

# Advanced cache management
cache_get() {
  local key="$1" cache_file="$CACHE_DIR/content/$key"
  [[ -f "$cache_file" ]] && cat "$cache_file" && return 0
  return 1
}

cache_set() {
  local key="$1" value="$2" cache_file="$CACHE_DIR/content/$key"
  mkdir -p "$(dirname "$cache_file")"
  echo "$value" > "$cache_file"
}

cache_cleanup() {
  debug "Cleaning up cache (limit: $((CACHE_SIZE_LIMIT / 1024 / 1024))MB)"
  local current_size
  current_size="$(du -sb "$CACHE_DIR" 2>/dev/null | cut -f1 || echo 0)"
  
  if [[ "$current_size" -gt "$CACHE_SIZE_LIMIT" ]]; then
    find "$CACHE_DIR" -type f -name "*.cache" -printf '%T@ %p\n' 2>/dev/null | \
      sort -n | head -n 100 | cut -d' ' -f2- | xargs rm -f 2>/dev/null || true
    debug "Cache cleaned up"
  fi
}

# Desktop notification system
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

# Backup & rollback functionality
create_backup() {
  local backup_name="backup-$(date +%s)"
  local backup_path="$BACKUP_DIR/$backup_name"
  
  if [[ -d "$PUBLIC_DIR" ]]; then
    mkdir -p "$backup_path"
    cp -r "$PUBLIC_DIR"/* "$backup_path/" 2>/dev/null || true
    echo "$backup_path" > "$CACHE_DIR/last-backup"
    debug "Backup created: $backup_name"
  fi
}

rollback_build() {
  local last_backup
  if [[ -f "$CACHE_DIR/last-backup" ]]; then
    last_backup="$(cat "$CACHE_DIR/last-backup")"
    if [[ -d "$last_backup" ]]; then
      warn "Rolling back to previous build state..."
      rm -rf "$PUBLIC_DIR"/* 2>/dev/null || true
      cp -r "$last_backup"/* "$PUBLIC_DIR/" 2>/dev/null || true
      success "Rollback completed"
    fi
  fi
}

# Cleanup handler
cleanup_on_exit() {
  local exit_code=$?
  
  if [[ $exit_code -ne 0 ]]; then
    warn "Build failed with exit code $exit_code"
    
    if [[ "${BUILD_ROLLBACK_ON_FAILURE:-true}" == "true" ]]; then
      rollback_build
    fi
    
    notify "Build Failed" "Build process failed with exit code $exit_code" "critical"
  fi
  
  # Cleanup temporary files
  find "$TEMP_DIR" -type f -mtime +1 -delete 2>/dev/null || true
  
  debug "Cleanup completed"
}

trap cleanup_on_exit EXIT INT TERM

# ─── DEPENDENCY & ENVIRONMENT SETUP ────────────────────────────────────────────

check_dependencies() {
  info "Checking Dependencies"
  local deps=("node" "git") optional_deps=("jq" "curl" "gzip")
  local missing_deps=() missing_optional=()
  
  # Check required dependencies
  for dep in "${deps[@]}"; do
    if ! have "$dep"; then
      missing_deps+=("$dep")
    fi
  done
  
  # Check optional dependencies
  for dep in "${optional_deps[@]}"; do
    if ! have "$dep"; then
      missing_optional+=("$dep")
    fi
  done
  
  if [[ ${#missing_deps[@]} -gt 0 ]]; then
    die "Missing required dependencies: ${missing_deps[*]}"
  fi
  
  if [[ ${#missing_optional[@]} -gt 0 ]]; then
    warn "Missing optional dependencies (some features may be limited): ${missing_optional[*]}"
  fi
  
  success "Dependencies verified"
}

setup_environment() {
  info "Setting Up Environment"
  
  # Create directory structure
  mkdir -p "$PUBLIC_DIR" "$CONF_DIR" "$PAYLOAD_DIR" "$CACHE_DIR/content" "$LOGS_DIR" "$BACKUP_DIR" "$TEMP_DIR"
  
  # Set up build environment variables
  export NODE_ENV="${NODE_ENV:-production}"
  export BUILD_SESSION="$SESSION_ID"
  export BUILD_TIMESTAMP="$BUILD_TIMESTAMP"
  export BUILD_VERSION="$BUILD_VERSION"
  export BUILD_ID="$BUILD_ID"
  
  # Configure Node.js for optimal performance
  export UV_THREADPOOL_SIZE="$MAX_PARALLEL_JOBS"
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=4096"
  
  # System resource information
  local resources
  resources="$(get_system_resources)"
  debug "System resources: $resources"
  
  # Cache cleanup
  cache_cleanup
  
  success "Environment ready (Session: $SESSION_ID)"
}

# ─── SECURITY & VALIDATION ─────────────────────────────────────────────────────

security_scan() {
  if [[ "$ENABLE_SECURITY_SCAN" != "true" ]]; then
    return 0
  fi
  
  info "Running Security Scans"
  
  # Check for suspicious patterns in scripts
  local suspicious_patterns=("eval\s*\(" "exec\s*\(" "\$\(\s*curl" "rm\s+-rf\s+/" ">\s*/dev/")
  local scan_results=()
  
  while IFS= read -r -d '' file; do
    for pattern in "${suspicious_patterns[@]}"; do
      if grep -qE "$pattern" "$file" 2>/dev/null; then
        scan_results+=("$file: potentially suspicious pattern '$pattern'")
      fi
    done
  done < <(find "$SRC_DIR" "$SCRIPTS_DIR" -type f \( -name "*.js" -o -name "*.sh" \) -print0 2>/dev/null)
  
  if [[ ${#scan_results[@]} -gt 0 ]]; then
    warn "${E_SECURITY} Security scan found potential issues:"
    printf '%s\n' "${scan_results[@]}" >&2
  else
    success "${E_SECURITY} Security scan passed"
  fi
}

validate_configuration() {
  info "Validating Configuration"
  
  # Check master-rules.yaml
  if [[ -f "$ROOT_DIR/configs/master-rules.yaml" ]]; then
    if have node && node -e "const yaml=require('js-yaml'); yaml.load(require('fs').readFileSync('$ROOT_DIR/configs/master-rules.yaml','utf8'))" 2>/dev/null; then
      success "Configuration validation passed"
    else
      warn "Configuration validation failed for master-rules.yaml"
    fi
  fi
  
  # Validate directory permissions
  if [[ ! -w "$PUBLIC_DIR" ]]; then
    die "Output directory is not writable: $PUBLIC_DIR"
  fi
}

# ─── ENHANCED BUILD FUNCTIONS ──────────────────────────────────────────────────

clean_artifacts() {
  info "Cleaning Build Artifacts"
  
  # Create backup before cleaning
  create_backup
  
  # Clean output directories
  local dirs_to_clean=("$CONF_DIR" "$PAYLOAD_DIR")
  for dir in "${dirs_to_clean[@]}"; do
    if [[ -d "$dir" ]]; then
      find "$dir" -mindepth 1 -delete 2>/dev/null || true
    fi
  done
  
  # Clean old logs (keep last 10)
  find "$LOGS_DIR" -name "build-*.log" -type f | sort -r | tail -n +11 | xargs rm -f 2>/dev/null || true
  
  success "Artifacts cleaned"
}

generate_configurations() {
  info "Generating Client Configurations"
  
  local scripts=("gen-shadowrocket.js" "gen-stash.js" "gen-loon.js" "gen-mobileconfig.js")
  local generated=0 failed=0 total=${#scripts[@]}
  
  for i in "${!scripts[@]}"; do
    local script="${scripts[$i]}"
    local script_path="$SCRIPTS_DIR/$script"
    
    show_progress $((i + 1)) "$total" "Generating configs"
    
    if [[ -f "$script_path" ]]; then
      local cache_key
      cache_key="config-$(hash_content "$script_path")"
      
      if cache_get "$cache_key" >/dev/null; then
        debug "Using cached configuration for $script"
        ((generated++))
      else
        if timeout "$BUILD_TIMEOUT" node "$script_path" --final-group US --emit-json --stats 2>/dev/null; then
          cache_set "$cache_key" "success"
          success "Generated ${script/gen-/}"
          ((generated++))
        else
          error "Failed to generate ${script/gen-/}"
          ((failed++))
        fi
      fi
    else
      debug "Script not found: $script"
    fi
  done
  
  if [[ $failed -gt 0 ]]; then
    warn "$failed configuration(s) failed to generate"
  fi
  
  success "Configuration generation completed ($generated/$total successful)"
}

# Enhanced payload processing with intelligent caching
process_payload() {
  local js_file="$1"
  local base_name
  base_name="$(basename "${js_file%.js}")"
  local encoded_file="$PAYLOAD_DIR/${base_name}.js.b64"
  
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

process_all_payloads() {
  info "Processing JavaScript Payloads"
  
  # Find all JavaScript files
  local js_files=()
  while IFS= read -r -d '' file; do
    js_files+=("$file")
  done < <(find "$SRC_DIR" -name "*.js" -type f -print0 2>/dev/null)
  
  if [[ ${#js_files[@]} -eq 0 ]]; then
    warn "No JavaScript files found in '$SRC_DIR'"
    return 0
  fi
  
  info "Found ${#js_files[@]} files. Processing with $MAX_PARALLEL_JOBS workers..."
  
  # Process files in parallel with progress tracking
  local results temp_file
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
  
  local cache_efficiency
  cache_efficiency="$(( (cache_count * 100) / ${#js_files[@]} ))"
  
  success "Payload processing completed:"
  echo "  • Total: ${#js_files[@]} files"
  echo "  • Built: $((built_count + compressed_count)) (compressed: $compressed_count)"
  echo "  • Cached: $cache_count (${cache_efficiency}% hit rate)"
  echo "  • Failed: $failed_count"
  
  if [[ $failed_count -gt 0 ]]; then
    die "$failed_count payload(s) failed to process"
  fi
}

generate_manifest_and_assets() {
  info "Generating Manifest and Static Assets"
  
  # Enhanced manifest generation with metadata
  if have jq; then
    # Create enhanced manifest with file metadata
    (
      cd "$PAYLOAD_DIR" || exit 1
      find . -name "*.js.b64" -type f | while read -r file; do
        local size checksum
        size="$(wc -c < "$file" 2>/dev/null || echo 0)"
        checksum="$(sha256sum "$file" 2>/dev/null | cut -d' ' -f1 || echo "unknown")"
        jq -n --arg name "$(basename "$file")" --arg size "$size" --arg checksum "$checksum" \
          '{name: $name, size: ($size|tonumber), checksum: $checksum}'
      done | jq -s . > "$PUBLIC_DIR/manifest.json"
    )
  else
    # Fallback simple manifest
    (
      cd "$PAYLOAD_DIR" || exit 1
      printf '%s\n' *.js.b64 2>/dev/null | jq -R . | jq -s . > "$PUBLIC_DIR/manifest.json" 2>/dev/null || echo '[]' > "$PUBLIC_DIR/manifest.json"
    )
  fi
  
  success "Generated enhanced manifest.json"
  
  # Generate MITM loader
  if [[ -f "$SCRIPTS_DIR/gen-mitm-loader.js" ]]; then
    if node "$SCRIPTS_DIR/gen-mitm-loader.js" 2>/dev/null; then
      success "Generated mitm-loader.js"
    else
      warn "Failed to generate mitm-loader.js"
    fi
  fi
  
  # Copy static assets with error handling
  local static_files=("manifest-loader.html:index.html" "catalog-template.html:catalog.html")
  for file_mapping in "${static_files[@]}"; do
    local src="${file_mapping%:*}" dst="${file_mapping#*:}"
    if [[ -f "$SCRIPTS_DIR/$src" ]]; then
      cp "$SCRIPTS_DIR/$src" "$PUBLIC_DIR/$dst"
      success "Copied $dst"
    else
      warn "Static file not found: $src"
    fi
  done
  
  # Enhanced build info with system metrics
  local system_info payload_count config_count
  system_info="$(get_system_resources)"
  payload_count="$(find "$PAYLOAD_DIR" -name "*.js.b64" | wc -l)"
  config_count="$(find "$CONF_DIR" -name "*.conf" | wc -l)"
  
  if have jq; then
    jq -n \
      --arg version "$BUILD_VERSION" \
      --arg buildId "$BUILD_ID" \
      --arg timestamp "$BUILD_TIMESTAMP" \
      --arg sessionId "$SESSION_ID" \
      --argjson payloads "$payload_count" \
      --argjson configs "$config_count" \
      --argjson system "$system_info" \
      '{
        version: $version,
        buildId: $buildId,
        timestamp: $timestamp,
        sessionId: $sessionId,
        stats: {
          processed: $payloads,
          configs: $configs
        },
        system: $system,
        generator: {
          name: "build-all.sh",
          version: "2.0.0",
          author: "PopduexRem"
        }
      }' > "$PUBLIC_DIR/build-info.json"
  else
    # Fallback build info
    cat > "$PUBLIC_DIR/build-info.json" << EOF
{
  "version": "$BUILD_VERSION",
  "buildId": "$BUILD_ID",
  "timestamp": "$BUILD_TIMESTAMP",
  "sessionId": "$SESSION_ID",
  "stats": {
    "processed": $payload_count,
    "configs": $config_count
  }
}
EOF
  fi
  
  success "Generated enhanced build-info.json"
}

validate_build_artifacts() {
  info "Validating Build Artifacts"
  local errors=0 warnings=0
  
  # Validate manifest
  if [[ -f "$PUBLIC_DIR/manifest.json" ]]; then
    if have jq && jq -e '. | length > 0' "$PUBLIC_DIR/manifest.json" >/dev/null 2>&1; then
      success "Manifest validation passed"
    else
      error "Manifest validation failed"
      ((errors++))
    fi
  else
    error "Manifest file missing"
    ((errors++))
  fi
  
  # Check for zero-byte files
  local empty_files
  empty_files="$(find "$PUBLIC_DIR" -type f -size 0 2>/dev/null || true)"
  if [[ -n "$empty_files" ]]; then
    warn "Found zero-byte files:"
    echo "$empty_files" >&2
    ((warnings++))
  fi
  
  # Validate configuration files
  local conf_files
  conf_files="$(find "$CONF_DIR" -name "*.conf" 2>/dev/null || true)"
  if [[ -n "$conf_files" ]]; then
    while IFS= read -r conf_file; do
      if [[ ! -s "$conf_file" ]]; then
        error "Empty configuration file: $conf_file"
        ((errors++))
      fi
    done <<< "$conf_files"
  fi
  
  # File integrity checks
  local total_size
  total_size="$(du -sb "$PUBLIC_DIR" 2>/dev/null | cut -f1 || echo 0)"
  
  if [[ "$total_size" -lt 1024 ]]; then
    warn "Build output seems unusually small (${total_size} bytes)"
    ((warnings++))
  fi
  
  if [[ $errors -gt 0 ]]; then
    die "Validation failed with $errors error(s) and $warnings warning(s)"
  else
    success "Validation completed with $warnings warning(s)"
  fi
}

# ─── INTERACTIVE & WATCH MODE ──────────────────────────────────────────────────

interactive_build() {
  echo -e "\n${C_BOLD}═══ Interactive Build Mode ═══${C_RESET}"
  echo "Select components to build:"
  echo "  1) Configurations only"
  echo "  2) Payloads only"
  echo "  3) Full build"
  echo "  4) Clean and rebuild"
  echo "  5) Validate artifacts only"
  echo "  q) Quit"
  
  read -rp "Choice [1-5,q]: " choice
  
  case "$choice" in
    1) generate_configurations ;;
    2) process_all_payloads && generate_manifest_and_assets ;;
    3) run_full_build ;;
    4) clean_artifacts && run_full_build ;;
    5) validate_build_artifacts ;;
    q|Q) echo "Goodbye!"; exit 0 ;;
    *) warn "Invalid choice"; interactive_build ;;
  esac
}

watch_mode() {
  info "Starting watch mode (Ctrl+C to stop)"
  
  if ! have inotifywait && ! have fswatch; then
    die "Watch mode requires inotifywait (Linux) or fswatch (macOS)"
  fi
  
  local last_build=0
  
  while true; do
    local current_time
    current_time="$(date +%s)"
    
    # Check for file changes
    local changed_files
    if have inotifywait; then
      changed_files="$(inotifywait -r -e modify,create,delete --format '%w%f' "$SRC_DIR" "$SCRIPTS_DIR" -t 1 2>/dev/null || true)"
    elif have fswatch; then
      changed_files="$(timeout 1 fswatch -1 "$SRC_DIR" "$SCRIPTS_DIR" 2>/dev/null || true)"
    fi
    
    if [[ -n "$changed_files" ]] && [[ $((current_time - last_build)) -gt 2 ]]; then
      info "Changes detected, rebuilding..."
      run_full_build
      last_build="$current_time"
      notify "Build Complete" "Automatic rebuild finished" "normal"
    fi
    
    sleep 1
  done
}

# ─── MAIN BUILD ORCHESTRATION ──────────────────────────────────────────────────

run_full_build() {
  local start_time
  start_time="$(date +%s)"
  
  # Core build steps
  security_scan
  validate_configuration
  clean_artifacts
  generate_configurations
  process_all_payloads
  generate_manifest_and_assets
  validate_build_artifacts
  
  local end_time duration
  end_time="$(date +%s)"
  duration="$((end_time - start_time))"
  
  # Build summary
  local payload_count config_count total_size
  payload_count="$(find "$PAYLOAD_DIR" -name "*.js.b64" | wc -l)"
  config_count="$(find "$CONF_DIR" -name "*.conf" | wc -l)"
  total_size="$(du -sh "$PUBLIC_DIR" 2>/dev/null | cut -f1 || echo "unknown")"
  
  info "Build Complete!"
  cat << EOF

${C_BOLD}┌──────────────────────┬─────────────────────────────────────────┐${C_RESET}
${C_BOLD}│ Build Summary        │                                         │${C_RESET}
${C_BOLD}├──────────────────────┼─────────────────────────────────────────┤${C_RESET}
${C_BOLD}│ Version              │${C_RESET} ${BUILD_VERSION}                  ${C_BOLD}│${C_RESET}
${C_BOLD}│ Build ID             │${C_RESET} ${BUILD_ID}                              ${C_BOLD}│${C_RESET}
${C_BOLD}│ Session ID           │${C_RESET} ${SESSION_ID}                   ${C_BOLD}│${C_RESET}
${C_BOLD}│ Configurations       │${C_RESET} ${config_count} files generated                   ${C_BOLD}│${C_RESET}
${C_BOLD}│ Payloads             │${C_RESET} ${payload_count} files processed                  ${C_BOLD}│${C_RESET}
${C_BOLD}│ Total Size           │${C_RESET} ${total_size}                                 ${C_BOLD}│${C_RESET}
${C_BOLD}│ Build Duration       │${C_RESET} ${duration} seconds                            ${C_BOLD}│${C_RESET}
${C_BOLD}└──────────────────────┴─────────────────────────────────────────┘${C_RESET}

EOF
  
  success "All artifacts are located in: $PUBLIC_DIR"
  
  # Send completion notification
  notify "Build Complete" "Build finished in ${duration}s - ${payload_count} payloads, ${config_count} configs" "normal"
}

# ─── COMMAND LINE INTERFACE ────────────────────────────────────────────────────

show_help() {
  cat << EOF
${C_BOLD}Build System v2.0.0${C_RESET}
Enhanced build orchestrator with caching, parallel processing, and validation.

${C_BOLD}USAGE:${C_RESET}
  $0 [OPTIONS]

${C_BOLD}OPTIONS:${C_RESET}
  -h, --help              Show this help message
  -i, --interactive       Run in interactive mode
  -w, --watch             Enable watch mode for continuous builds
  -c, --clean-only        Clean artifacts without rebuilding
  -v, --verbose           Enable verbose logging
  --no-cache              Disable caching
  --no-compression        Disable payload compression
  --no-security-scan      Skip security scanning

${C_BOLD}ENVIRONMENT VARIABLES:${C_RESET}
  BUILD_MAX_JOBS         Maximum parallel processing jobs (default: CPU cores)
  BUILD_CACHE_SIZE       Cache size limit in bytes (default: 1GB)
  BUILD_TIMEOUT          Build timeout in seconds (default: 300)
  BUILD_WATCH            Enable watch mode (true/false)
  BUILD_INTERACTIVE      Enable interactive mode (true/false)
  BUILD_NOTIFICATIONS    Enable notifications (true/false)
  DEBUG                  Enable debug output (1/0)
EOF
}

# ─── MAIN EXECUTION ─────────────────────────────────────────────────────────────

main() {
  local start_time
  start_time="$(date +%s)"
  
  # Parse command line arguments
  while [[ $# -gt 0 ]]; do
    case $1 in
      -h|--help)
        show_help
        exit 0
        ;;
      -i|--interactive)
        export ENABLE_INTERACTIVE="true"
        shift
        ;;
      -w|--watch)
        export ENABLE_WATCH_MODE="true"
        shift
        ;;
      -c|--clean-only)
        setup_environment
        clean_artifacts
        exit 0
        ;;
      -v|--verbose)
        export DEBUG=1
        shift
        ;;
      --no-cache)
        rm -rf "$CACHE_DIR/content" && mkdir -p "$CACHE_DIR/content"
        shift
        ;;
      --no-compression)
        export ENABLE_COMPRESSION="false"
        shift
        ;;
      --no-security-scan)
        export ENABLE_SECURITY_SCAN="false"
        shift
        ;;
      *)
        echo "Unknown option: $1" >&2
        show_help
        exit 1
        ;;
    esac
  done
  
  # Initialize environment
  check_dependencies
  setup_environment
  
  # Banner
  cat << EOF
${C_BOLD}
════════════════════════════════════════════════════════════════════════════════
                    Enterprise Build System v2.0.0
                       Author: PopduexRem @ 2025
════════════════════════════════════════════════════════════════════════════════${C_RESET}
  ${C_INFO}Session:${C_RESET} $SESSION_ID
  ${C_INFO}Mode:${C_RESET} $([[ "$ENABLE_INTERACTIVE" == "true" ]] && echo "Interactive" || [[ "$ENABLE_WATCH_MODE" == "true" ]] && echo "Watch" || echo "Standard")
  ${C_INFO}Workers:${C_RESET} $MAX_PARALLEL_JOBS

EOF
  
  # Execution mode selection
  if [[ "$ENABLE_INTERACTIVE" == "true" ]]; then
    interactive_build
  elif [[ "$ENABLE_WATCH_MODE" == "true" ]]; then
    watch_mode
  else
    run_full_build
  fi
  
  local total_time
  total_time="$(($(date +%s) - start_time))"
  
  log_structured "INFO" "Build completed in ${total_time}s" "main" "{\"duration\":$total_time}"
  debug "Build session $SESSION_ID completed successfully"
}

# Execute main function with all arguments
main "$@"
