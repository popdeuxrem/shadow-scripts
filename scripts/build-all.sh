#!/usr/bin/env bash
set -Eeuo pipefail

# === Lightweight Launcher with Step Logging ===
ROOT_DIR=$(pwd)
VERSION=${VERSION:-"0.0.0"}

# Default flags
DEPLOY_ENV="production"
OBFUSCATION_PROFILE="medium"
FORCE_REBUILD=0
SKIP_VALIDATION=0
DEBUG_MODE=0

# === Logging Helpers ===
log_info()    { echo -e "\033[36m[INFO]\033[0m $1"; }
log_success() { echo -e "\033[32m[SUCCESS]\033[0m $1"; }
log_warn()    { echo -e "\033[33m[WARN]\033[0m $1"; }
log_error()   { echo -e "\033[31m[ERROR]\033[0m $1" >&2; exit 1; }
log_step()    { echo -e "\n\033[35m=== [$1] $2 ===\033[0m"; }
start_timer() { date +%s; }
end_timer()   { echo $(( $(date +%s) - $1 )); }

# === Parse Arguments ===
while (("$#")); do
  case "$1" in
    --env) DEPLOY_ENV="$2"; shift 2 ;;
    --profile) OBFUSCATION_PROFILE="$2"; shift 2 ;;
    --force-rebuild) FORCE_REBUILD=1; shift ;;
    --skip-validation) SKIP_VALIDATION=1; shift ;;
    --debug) DEBUG_MODE=1; shift ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --env <env>           Deployment environment (default: production)"
      echo "  --profile <profile>   Obfuscation profile [light|medium|heavy|stealth]"
      echo "  --force-rebuild       Force full rebuild"
      echo "  --skip-validation     Skip validation step"
      echo "  --debug               Enable verbose debugging"
      exit 0
      ;;
    *) log_error "Unknown argument: $1" ;;
  esac
done

# === Preflight Checks ===
log_step "PRE" "Checking required commands"
for cmd in node pnpm git; do
  command -v $cmd >/dev/null 2>&1 || log_error "Missing required command: $cmd"
done
log_success "All required commands present"

# === Build Start ===
BUILD_START=$(start_timer)
log_step "BUILD" "Launching gen-all.js pipeline"

NODE_ENV=production \
VERSION="$VERSION" \
node "$ROOT_DIR/scripts/gen-all.js" \
  --outdir "$ROOT_DIR/apps/loader/public/configs" \
  --profile "$OBFUSCATION_PROFILE" \
  $( [ $FORCE_REBUILD -eq 1 ] && echo "--force-rebuild" ) \
  $( [ $SKIP_VALIDATION -eq 1 ] && echo "--skip-validation" ) \
  $( [ $DEBUG_MODE -eq 1 ] && echo "--debug" )

BUILD_DURATION=$(end_timer $BUILD_START)
log_success "Pipeline finished in ${BUILD_DURATION}s"

# === Summary ===
log_step "SUMMARY" "Generated files overview"
echo "──────────────────────────────"
echo "📦 Configs: $(ls -1 "$ROOT_DIR/apps/loader/public/configs" 2>/dev/null | wc -l)"
echo "🔗 QR Codes: $(ls -1 "$ROOT_DIR/apps/loader/public/qrcodes" 2>/dev/null | wc -l || echo 0)"
echo "📊 Dashboard: $(ls -1 "$ROOT_DIR/apps/loader/public" | grep -E 'catalog|manifest' || echo 'none')"
echo "──────────────────────────────"
log_success "Build completed successfully"