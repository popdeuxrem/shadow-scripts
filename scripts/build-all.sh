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
readonly LOGS_DIR="${ROOT_DIR}/.build-logs"

# Build metadata - these are readonly constants
readonly BUILD_TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
readonly BUILD_VERSION=$(date -u +"%Y%m%d-%H%M%S")
readonly BUILD_ID="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo "local")}"
readonly SESSION_ID="build-$(date +%s)-$$"

# Performance settings - these can be overridden from environment
MAX_PARALLEL_JOBS="${BUILD_MAX_JOBS:-$(nproc 2>/dev/null || sysctl -n hw.ncpu 2>/dev/null || echo 4)}"
CACHE_SIZE_LIMIT="${BUILD_CACHE_SIZE:-1073741824}"  # 1GB default
BUILD_TIMEOUT="${BUILD_TIMEOUT:-300}"  # 5 minutes

# Feature flags - these can be overridden from environment or CLI args
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

# Enhanced logging functions
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

info()    { echo -e "${C_INFO}${E_ROCKET}${C_RESET} ${C_BOLD}$*${C_RESET}"; log_structured "INFO" "$*"; }
success() { echo -e "${C_SUCCESS} ${E_CHECK} ${C_RESET}$*"; log_structured "INFO" "$*"; }
warn()    { echo -e "${C_WARN} ${E_WARN} ${C_RESET}$*" >&2; log_structured "WARN" "$*"; }
debug()   { [[ "${DEBUG:-}" == "1" ]] && echo -e "${C_DEBUG}${E_DEBUG} ${C_DIM}$*${C_RESET}" >&2; log_structured "DEBUG" "$*"; }
die()     { echo -e "\n${C_ERROR} ${E_ERROR} ERROR: $*${C_RESET}\n" >&2; log_structured "ERROR" "$*"; cleanup_on_exit; exit 1; }
have()    { command -v "$1" &>/dev/null; }

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
  
  # Set up environment variables
  export NODE_ENV="${NODE_ENV:-production}"
  export BUILD_SESSION="$SESSION_ID"
  export BUILD_TIMESTAMP="$BUILD_TIMESTAMP"
  export BUILD_VERSION="$BUILD_VERSION"
  export BUILD_ID="$BUILD_ID"
  
  success "Environment ready"
  debug "Build ID: ${BUILD_ID}"
  debug "Session ID: ${SESSION_ID}"
}

# 2. Clean previous build artifacts
clean() {
  info "Cleaning Old Artifacts"
  # A targeted clean is safer than 'rm -rf' on the whole public dir
  find "$CONF_DIR" "$PAYLOAD_DIR" -mindepth 1 -delete
  success "Cleaned output directories"
}

# ... rest of your script ...

# Cleanup handler
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

# --- Main Execution ---
main() {
  # Rest of your main function...
}

# Run the main function
main "$@"
