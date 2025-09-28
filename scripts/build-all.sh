#!/usr/bin/env bash
set -Eeuo pipefail

# === Configuration ===
ROOT_DIR=$(pwd)
VERSION=${VERSION:-"0.0.0"}
DIST_DIR="apps/loader/public/v$VERSION"
LATEST_DIR="apps/loader/public/latest"
BUILD_INFO_FILE="$DIST_DIR/build-info.json"
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
REPORT_FILE="$DIST_DIR/pipeline-report.json"

# Flags
FORCE_REBUILD=0
SKIP_VALIDATION=0
DEBUG_MODE=0
DEPLOY_ENV="production"
OBFUSCATION_PROFILE="medium"

# === Logging Helpers ===
log_info()    { echo -e "\033[36m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[32m[SUCCESS]\033[0m $1"; }
log_warn()    { echo -e "\033[33m[WARN]\033[0m $1"; }
log_error()   { echo -e "\033[31m[ERROR]\033[0m $1" >&2; exit 1; }
log_step()    { echo -e "\n\033[35m=== [$1/$2] $3 ===\033[0m"; }
start_step_timer() { step_start_time=$(date +%s); }
end_step_timer()   { local end=$(date +%s); log_success "Step completed in $((end - step_start_time))s"; }

# === Utilities ===
validate_cmd() { command -v "$1" &>/dev/null || log_error "Missing required command: '$1'"; }

# === Argument Parsing ===
parse_args() {
  while (("$#")); do
    case "$1" in
      --env) DEPLOY_ENV="$2"; shift 2 ;;
      --profile) OBFUSCATION_PROFILE="$2"; shift 2 ;;
      --force-rebuild) FORCE_REBUILD=1; shift ;;
      --skip-validation) SKIP_VALIDATION=1; shift ;;
      --debug) DEBUG_MODE=1; shift ;;
      -h|--help)
        cat <<EOF
Usage: $0 [options]

Options:
  --env <env>           Deployment environment (default: production)
  --profile <profile>   Obfuscation profile [light|medium|heavy|stealth]
  --force-rebuild       Force full rebuild (ignore caches)
  --skip-validation     Skip validation step
  --debug               Enable verbose debugging
  -h, --help            Show this help
EOF
        exit 0
        ;;
      *) log_error "Unknown argument: $1" ;;
    esac
  done
}

# === Preflight Checks ===
preflight_checks() {
  log_step 0 8 "Preflight Checks"
  start_step_timer

  for cmd in git node pnpm rsync; do validate_cmd "$cmd"; done
  mkdir -p "$ROOT_DIR/scripts" \
           "$ROOT_DIR/$DIST_DIR" \
           "$ROOT_DIR/$LATEST_DIR" \
           "$ROOT_DIR/apps/loader/public/configs" \
           "$ROOT_DIR/.build-cache"

  end_step_timer
}

# === Run Build ===
run_build() {
  start_time=$(date +%s)
  STEP=1

  preflight_checks

  # Step 1: Install dependencies
  log_step $((STEP++)) 8 "Installing dependencies"
  start_step_timer
  if [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile --prefer-offline
  else
    pnpm install --prefer-offline
  fi
  end_step_timer

  # Step 2: Obfuscate payloads
  log_step $((STEP++)) 8 "Obfuscating payloads"
  start_step_timer
  rm -rf "$ROOT_DIR/apps/loader/public/obfuscated"
  mkdir -p "$ROOT_DIR/apps/loader/public/obfuscated"
  node "$ROOT_DIR/scripts/obfuscate-all.js" --profile "$OBFUSCATION_PROFILE" || log_warn "Obfuscation failed"
  end_step_timer

  # Step 3: Run unified generator (gen-all.js)
  log_step $((STEP++)) 8 "Generating all configs via gen-all.js"
  start_step_timer
  node "$ROOT_DIR/scripts/gen-all.js" --outdir "$ROOT_DIR/apps/loader/public/configs" --ci || log_warn "gen-all.js encountered warnings"
  end_step_timer

  # Step 4: Generate QR Codes
  log_step $((STEP++)) 8 "Generating QR codes"
  start_step_timer
  if [ -f "$ROOT_DIR/scripts/gen-qrcodes.js" ]; then
    node "$ROOT_DIR/scripts/gen-qrcodes.js" --output "$ROOT_DIR/apps/loader/public/qrcodes" --version "$GIT_HASH"
  else
    log_warn "QR code generator missing"
  fi
  end_step_timer

  # Step 5: Validation
  if [ $SKIP_VALIDATION -eq 0 ]; then
    log_step $((STEP++)) 8 "Validation"
    start_step_timer
    node "$ROOT_DIR/scripts/validate-gitignore.js" || log_warn ".gitignore validation failed"
    node "$ROOT_DIR/scripts/validate-configs.js" || log_warn "Config validation warnings"
    end_step_timer
  else
    log_info "Skipping validation step"
  fi

  # Step 6: Build Summary + Pipeline Report
  log_step $((STEP++)) 8 "Build Summary & Pipeline Report"
  start_step_timer
  total_payloads=$(ls -1 "$ROOT_DIR/apps/loader/public/obfuscated" | wc -l)
  echo "──────────────────────────────"
  echo "📦 Payloads obfuscated: $total_payloads"
  echo "⚙️ Configs generated: apps/loader/public/configs/"
  echo "🔗 QR Codes: $ROOT_DIR/apps/loader/public/qrcodes/*"
  echo "──────────────────────────────"

  mkdir -p "$(dirname "$REPORT_FILE")"
  cat <<EOF > "$REPORT_FILE"
{
  "git_hash": "$GIT_HASH",
  "version": "$VERSION",
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "payloads": $total_payloads,
  "configs_dir": "apps/loader/public/configs",
  "qrcodes_dir": "apps/loader/public/qrcodes"
}
EOF
  log_success "Pipeline report written: $REPORT_FILE"
  end_step_timer

  total_time=$(( $(date +%s) - start_time ))
  log_success "Total build time: ${total_time}s"
}

# === Execute ===
parse_args "$@"
run_build