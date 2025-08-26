#!/usr/bin/env node
/*
 * Regenerate MITM payload-loader (for Shadowrocket / Stash script-injection)
 * -------------------------------------------------------------------------
 * ‣ Reads   : apps/loader/public/manifest.json  (array of *.js.b64 names)
 * ‣ Writes  : apps/loader/public/scripts/mitm-loader.js
 * ‣ Runtime : CommonJS – no "type": "module" required.
 */
'use strict';

const fs   = require('fs');
const path = require('path');

/* ---------- Paths ---------- */
const ROOT        = path.join(__dirname, '..');
const PUBLIC_DIR  = path.join(ROOT, 'apps', 'loader', 'public');
const MANIFEST    = path.join(PUBLIC_DIR, 'manifest.json');
const OUT_DIR     = path.join(PUBLIC_DIR, 'scripts');
const OUT_FILE    = path.join(OUT_DIR, 'mitm-loader.js');

/* ---------- Load manifest ---------- */
let names = [];
try {
  names = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'))
            .filter(f => f.endsWith('.js.b64'))
            .map(f => f.replace(/\.js\.b64$/, ''));
} catch (e) {
  console.error('✖  Cannot read manifest:', e.message);
  process.exit(1);
}

if (!names.length) {
  console.error('✖  Manifest empty – nothing to write.');
  process.exit(1);
}

/* ---------- Template ---------- */
const tpl = `/**
 * Auto-generated MITM payload loader  – DO NOT EDIT
 * Manifest size: ${names.length}  •  Generated: ${new Date().toISOString()}
 * -------------------------------------------------------------- */
(function(){'use strict';
  const base = new URL('./obfuscated/', location.origin + location.pathname);
  const list = ${JSON.stringify(names)};               // from manifest.json

  function log(msg){try{console.log('[mitm]', msg);}catch(_){}}

  async function inject(name){
    const url = base + name + '.js.b64';
    try{
      const res = await fetch(url);
      if(!res.ok) throw new Error('HTTP '+res.status);
      const code = atob((await res.text()).trim());
      const s = document.createElement('script');
      s.textContent = code;
      document.documentElement.appendChild(s);
      log('✓ '+name);
    }catch(err){ log('✗ '+name+'  '+err.message); }
  }

  Promise.all(list.map(inject)).then(()=>log('All payloads processed.'));
})();`;

/* ---------- Write file ---------- */
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, tpl);
console.log(`✔︎  Wrote ${OUT_FILE}  (${names.length} payloads)`);
