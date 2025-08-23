#!/bin/bash
set -e

OUTDIR="apps/loader/public/obfuscated"
LOADER="apps/loader/public/index.html"
MANIFEST="apps/loader/public/manifest.json"
CATALOG="apps/loader/public/catalog.html"

mkdir -p "$OUTDIR"
mkdir -p "apps/loader/public"

# 1. List all .js.b64 files for loader/manifest/catalog
cd "$OUTDIR"
FILES=$(find . -name "*.js.b64" | sed 's|^\./||g' | jq -R . | jq -s .)
FILES_RAW=$(find . -name "*.js.b64" | sort | sed 's|^\./||g')
cd ../..

# 2. Generate index.html loader from template
sed "s|__SPOOF_TARGETS__|$FILES|" scripts/index-template.html > "$LOADER"

# 3. Generate manifest.json (list of all .js.b64)
echo "$FILES" > "$MANIFEST"

# 4. Generate catalog.html
LIST_HTML=""
for file in $FILES_RAW; do
  LIST_HTML="$LIST_HTML<li><span class=\"url\">$file</span></li>"
done
sed "s|__CATALOG_LIST__|$LIST_HTML|" scripts/catalog-template.html > "$CATALOG"

echo "Generated: $LOADER"
echo "Generated: $MANIFEST"
echo "Generated: $CATALOG"
