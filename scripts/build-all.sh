#!/usr/bin/env bash
set -Eeuo pipefail

# === Configuration ===
ROOT_DIR=$(pwd)
VERSION=${VERSION:-"0.0.0"}
DIST_DIR="apps/loader/public/v$VERSION"
LATEST_DIR="apps/loader/public/latest"
BUILD_INFO_FILE="$DIST_DIR/build-info.json"
GIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

# Flags
FORCE_REBUILD=0
SKIP_VALIDATION=0
DEBUG_MODE=0
DEPLOY_ENV="production"
OBFUSCATION_PROFILE="medium"

# === Logging Helpers ===
log_info()    { echo -e "\033[34m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[32m[SUCCESS]\033[0m $1"; }
log_warn()    { echo -e "\033[33m[WARN]\033[0m $1"; }
log_error()   { echo -e "\033[31m[ERROR]\033[0m $1" >&2; exit 1; }
log_step()    { echo -e "\n\033[36m=== [$1/$2] $3 ===\033[0m"; }
start_step_timer() { step_start_time=$(date +%s); }
end_step_timer()   { local end=$(date +%s); log_success "Step completed in $((end - step_start_time))s"; }

# === Utilities ===
validate_cmd() {
  local cmd="$1"
  command -v "$cmd" &>/dev/null || log_error "Missing required command: '$cmd'"
}

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
  log_step 0 10 "Preflight Checks"
  start_step_timer

  # Required commands
  for cmd in git node pnpm rsync; do validate_cmd "$cmd"; done

  # Prepare directories
  mkdir -p "$ROOT_DIR/src-scripts" \
           "$ROOT_DIR/scripts" \
           "$ROOT_DIR/$DIST_DIR" \
           "$ROOT_DIR/$LATEST_DIR" \
           "$ROOT_DIR/apps/loader/public/configs" \
           "$ROOT_DIR/.build-cache"

  # Verify critical scripts
  local critical=(build-all.sh obfuscate-all.js gen-shadowrocket.js gen-loon.js \
                  gen-stash.js gen-tunna.js gen-mobileconfig.js gen-manifest.js \
                  gen-index-loader.js gen-mitm-loader.js gen-qrcodes.js)
  for f in "${critical[@]}"; do
    if [[ ! -f "$ROOT_DIR/scripts/$f" ]]; then
      log_warn "⚠️ Missing script: scripts/$f"
    fi
  done

  end_step_timer
}

# === Build Steps ===
run_build() {
  start_time=$(date +%s)
  local STEP=1

  preflight_checks

  # Step 1: Install dependencies
  log_step $((STEP++)) 10 "Installing dependencies"
  start_step_timer
  if [ -f "pnpm-lock.yaml" ]; then
    pnpm install --frozen-lockfile --prefer-offline
  else
    pnpm install --prefer-offline
  fi
  end_step_timer

  # Step 2: Clean + Obfuscate payloads
  log_step $((STEP++)) 10 "Obfuscating payloads"
  start_step_timer
  rm -rf "$ROOT_DIR/apps/loader/public/obfuscated"
  mkdir -p "$ROOT_DIR/apps/loader/public/obfuscated"
  node "$ROOT_DIR/scripts/obfuscate-all.js" --profile "$OBFUSCATION_PROFILE" || log_error "Obfuscation failed"
  end_step_timer

  # Step 3: Generate Manifest
  log_step $((STEP++)) 10 "Generating manifest"
  start_step_timer
  node "$ROOT_DIR/scripts/gen-manifest.js" --ci
  end_step_timer

  # Step 4: Generate Dashboards
  log_step $((STEP++)) 10 "Generating dashboards & loaders"
  start_step_timer
  node "$ROOT_DIR/scripts/gen-dashboard.js" --ci
  node "$ROOT_DIR/scripts/gen-index-loader.js" --ci
  node "$ROOT_DIR/scripts/gen-catalog.js" --ci || log_warn "Catalog generation skipped"
  end_step_timer

  # Step 5: Generate Configs
  log_step $((STEP++)) 10 "Generating proxy configs"
  start_step_timer
  node "$ROOT_DIR/scripts/gen-shadowrocket.js"
  node "$ROOT_DIR/scripts/gen-loon.js"
  node "$ROOT_DIR/scripts/gen-stash.js"
  node "$ROOT_DIR/scripts/gen-mobileconfig.js"
  node "$ROOT_DIR/scripts/gen-tunna.js"
  node "$ROOT_DIR/scripts/gen-egern.js"
  end_step_timer

  # Step 6: Generate QR Codes
  log_step $((STEP++)) 10 "Generating QR codes"
  start_step_timer
  if [ -f "$ROOT_DIR/scripts/gen-qrcodes.js" ]; then
    node "$ROOT_DIR/scripts/gen-qrcodes.js" --output "$ROOT_DIR/apps/loader/public/qrcodes" --version "$GIT_HASH"
  else
    log_warn "QR code generator missing"
  fi
  end_step_timer

  # Step 7: Validation
  if [ $SKIP_VALIDATION -eq 0 ]; then
    log_step $((STEP++)) 10 "Validating .gitignore"
    start_step_timer
    node "$ROOT_DIR/scripts/validate-gitignore.js" || log_warn ".gitignore validation failed"
    end_step_timer
  else
    log_info "Skipping validation step"
  fi

  # Step 8: Build Summary
  log_step $((STEP++)) 10 "Build Summary"
  start_step_timer
  echo "──────────────────────────────"
  echo "📦 Payloads obfuscated: $(ls -1 "$ROOT_DIR/apps/loader/public/obfuscated" | wc -l)"
  echo "📑 Manifest: $ROOT_DIR/apps/loader/public/manifest.json"
  echo "📊 Dashboards: $ROOT_DIR/apps/loader/public/catalog.html, manifest.html"
  echo "⚙️ Configs: apps/loader/public/*.conf, *.mobileconfig"
  echo "🔗 QR Codes: $ROOT_DIR/apps/loader/public/qrcodes/*"
  echo "──────────────────────────────"
  end_step_timer

  total_time=$(( $(date +%s) - start_time ))
  log_success "Total build time: ${total_time}s"
}

# === Run ===
parse_args "$@"
run_build
