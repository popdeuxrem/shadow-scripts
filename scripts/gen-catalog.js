#!/usr/bin/env node
/**
 * scripts/gen-catalog.js
 * ------------------------------------------------------------
 * Reads manifest.json (array of *.js.b64) and stamps that list
 * into scripts/catalog-template.html where the placeholder
 *   __CATALOG_LIST__
 * lives.  Each item links to the raw base64 file.
 */
const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const MANIFEST    = path.join(ROOT, 'apps/loader/public/manifest.json');
const TEMPLATE_IN = path.join(ROOT, 'scripts/catalog-template.html');
const OUT_DIR     = path.join(ROOT, 'apps/loader/public');
const OUT_FILE    = path.join(OUT_DIR, 'catalog.html');

if (!fs.existsSync(MANIFEST)) {
  console.error('manifest.json missing – run obfuscation step first');
  process.exit(0);                     // *not* fatal for whole build
}

const files = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
const list  = files.map(f =>
  `<li><a href="../obfuscated/${f}" target="_blank" rel="noopener">${f}</a></li>`
).join('\n');

let html = fs.readFileSync(TEMPLATE_IN, 'utf8');
html = html.replace('__CATALOG_LIST__', list || '<li>(no payloads)</li>');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, html);
console.log('✓ catalog.html →', path.relative(ROOT, OUT_FILE));
