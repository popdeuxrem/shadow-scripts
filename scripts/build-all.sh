#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")"/.. && pwd)"
SRC_DIR="$ROOT/src-scripts"
OUT_DIR="$ROOT/apps/loader/public/scripts"
MANIFEST="$OUT_DIR/manifest.json"

echo "=== [1/4] Generating all configs ==="
pnpm gen-configs

echo "=== [2/4] Obfuscating scripts and refreshing manifest ==="
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"
echo "{" > "$MANIFEST"
first=1
for f in "$SRC_DIR"/*.js; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  out="$OUT_DIR/$base"
  npx javascript-obfuscator "$f" --output "$out" --compact true --self-defending true --control-flow-flattening true
  if [ $first -eq 0 ]; then echo "," >> "$MANIFEST"; fi
  echo -n "  \"$base\": \"$base\"" >> "$MANIFEST"
  first=0
done
echo -e "\n}" >> "$MANIFEST"
echo "Obfuscated scripts and refreshed manifest at $MANIFEST"

echo "=== [3/4] Building loader app ==="
pnpm --filter @shadow/loader build

echo "=== [4/4] All done ==="
echo "Configs: $ROOT/apps/loader/public/configs/"
echo "Obfuscated scripts: $OUT_DIR"
echo "Manifest: $MANIFEST"

# Optional: open the configs/scripts dir if on macOS
if command -v open >/dev/null 2>&1; then
  open "$ROOT/apps/loader/public/"
fi
