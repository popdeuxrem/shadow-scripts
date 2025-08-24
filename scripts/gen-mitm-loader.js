#!/usr/bin/env node
/**
 * scripts/gen-mitm-loader.js
 * ------------------------------------------------------------
 *    manifest.json ─→ apps/loader/public/scripts/mitm-loader.js
 *
 * The generated JS:
 *   • decodes each base-64 payload
 *   • executes in order (top → bottom)
 *   • logs success / failure so you can tail the MITM console
 */
const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const MANIFEST    = path.join(ROOT, 'apps/loader/public/manifest.json');
const OUTDIR      = path.join(ROOT, 'apps/loader/public/scripts');
const OUTFILE     = path.join(OUTDIR, 'mitm-loader.js');
const CDN_BASE    = 'https://popdeuxrem.github.io/shadow-scripts/obfuscated/'; // adjust if custom domain

/* ── read manifest ────────────────────────────────────────── */
if (!fs.existsSync(MANIFEST)) {
  console.error('manifest.json not found, skip mitm-loader generation');
  process.exit(0);
}
const files = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) || [];
if (!files.length) {
  console.error('manifest empty, skip mitm-loader generation');
  process.exit(0);
}

/* ── template ─────────────────────────────────────────────── */
const loader = `// Auto-generated — DO NOT EDIT
(function(){const list=${JSON.stringify(files, null, 0)};
const base="${CDN_BASE}";
function log(msg){console.log("[MITM]",msg);}
(async()=>{for(const f of list){
  const url=base+f;
  try{
    const res=await fetch(url);if(!res.ok)throw new Error(res.status);
    const decoded=atob(await res.text());
    (0,eval)(decoded);
    log("✓ injected "+f);
  }catch(e){log("✗ "+f+" -> "+e.message);}
}})();})();`;

/* ── write ────────────────────────────────────────────────── */
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUTFILE, loader);
console.log('✓ mitm-loader.js →', path.relative(ROOT, OUTFILE));
