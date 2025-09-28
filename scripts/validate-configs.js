#!/usr/bin/env node
/**
 * scripts/validate-configs.js — Enhanced v4 (autofix support)
 * - Robust validation for manifest, obfuscated outputs, metadata, and configs
 * - Attempts to autofix missing text configs by running generator scripts when --autofix is provided
 * - Handles legacy and canonical filenames: .js, .ob.js, .ob.js.b64, .b64
 */

import fs from 'fs';
import path from 'path';
import child from 'child_process';
import yaml from 'js-yaml';
import plist from 'plist';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CONF_DIR = path.join(ROOT, 'apps/loader/public/configs');
const OBF_DIR = path.join(ROOT, 'apps/loader/public/obfuscated');
const PUBLIC_DIR = path.join(ROOT, 'apps/loader/public');

const ARGV = process.argv.slice(2);
const AUTOFIX = ARGV.includes('--autofix') || ARGV.includes('-a');
const CI_MODE = ARGV.includes('--ci');

const die = msg => { console.error(`\x1b[31m❌ ${msg}\x1b[0m`); process.exit(1); };
const warn = msg => console.warn(`\x1b[33m⚠ ${msg}\x1b[0m`);
const log = msg => console.log(`\x1b[36m🔹 ${msg}\x1b[0m`);
const info = msg => console.log(`\x1b[34mℹ ${msg}\x1b[0m`);

function existsAndNonEmpty(fp) {
  try {
    return fs.existsSync(fp) && fs.statSync(fp).size > 0;
  } catch (e) {
    return false;
  }
}

function runGeneratorIfExists(scriptRelPath, outputPath) {
  const scriptPath = path.join(ROOT, scriptRelPath);
  if (!fs.existsSync(scriptPath)) {
    warn(`Generator not found: ${scriptRelPath}`);
    return false;
  }
  try {
    info(`Running generator: node ${scriptRelPath} -> ${path.relative(ROOT, outputPath)}`);
    // run generator and redirect stdout into output
    const out = child.execSync(`node ${scriptPath}`, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, out);
    return existsAndNonEmpty(outputPath);
  } catch (e) {
    warn(`Generator ${scriptRelPath} failed: ${e.message}`);
    return false;
  }
}

// Normalize a manifest entry into possible canonical obfuscated filenames (relative to OBF_DIR)
function expectedObfFilesFromPayload(payloadPath) {
  const candidates = [];
  let rel = payloadPath || '';

  if (rel.startsWith('obfuscated/')) rel = rel.slice('obfuscated/'.length);

  const parsed = path.parse(rel);
  let base = parsed.name;
  if (rel.endsWith('.ob.js')) {
    base = path.basename(rel, '.ob.js');
  }

  const dir = parsed.dir || '';

  candidates.push(path.join(OBF_DIR, dir, `${base}.ob.js`));
  candidates.push(path.join(OBF_DIR, dir, `${base}.ob.js.b64`));
  candidates.push(path.join(OBF_DIR, dir, `${base}.js`));
  candidates.push(path.join(OBF_DIR, dir, `${base}.js.b64`));
  if (rel.endsWith('.b64')) {
    candidates.unshift(path.join(OBF_DIR, rel));
  }
  return candidates;
}

// Read manifest.json and produce payload list
function readManifestPayloads() {
  const manifestPath = path.join(PUBLIC_DIR, 'manifest.json');
  if (!existsAndNonEmpty(manifestPath)) die('manifest.json missing or empty (expected at apps/loader/public/manifest.json)');

  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
  catch (e) { die(`manifest.json not valid JSON: ${e.message}`); }

  let payloads = [];
  if (Array.isArray(manifest)) {
    payloads = manifest;
  } else if (manifest.payloads && Array.isArray(manifest.payloads)) {
    payloads = manifest.payloads.map(p => (typeof p === 'string' ? p : (p.path || p)));
  } else if (manifest.files && Array.isArray(manifest.files)) {
    payloads = manifest.files;
  } else if (manifest.assets && Array.isArray(manifest.assets)) {
    payloads = manifest.assets.map(a => a.filename || a.path || a);
  } else {
    die('manifest.json missing payloads/files/assets array (expected top-level array or { payloads/files/assets: [...] } )');
  }

  return payloads.filter(Boolean).map(String);
}

// ---------- Start Validation ----------

// Ensure config directory exists (may be created by build script)
fs.mkdirSync(CONF_DIR, { recursive: true });

// TEXT CONFIGS: shadowrocket.conf and loon.conf (auto-fixable)
const textConfigs = [
  { name: 'shadowrocket.conf', generator: 'scripts/gen-shadowrocket.js', validators: [/\[Rule\]/i, /\[General\]/i] },
  { name: 'loon.conf', generator: 'scripts/gen-loon.js', validators: [/\[Rule\]/i, /\[General\]/i] }
];

for (const cfg of textConfigs) {
  const fp = path.join(CONF_DIR, cfg.name);
  if (!existsAndNonEmpty(fp)) {
    warn(`${cfg.name} missing or empty: ${fp}`);
    if (AUTOFIX) {
      log(`Attempting to auto-generate ${cfg.name} using ${cfg.generator}...`);
      const ok = runGeneratorIfExists(cfg.generator, fp);
      if (!ok) {
        warn(`Auto-generation failed or produced empty file for ${cfg.name}`);
      }
    }
  }

  if (!existsAndNonEmpty(fp)) {
    die(`text config missing or empty: ${fp} (hint: run the generator ${cfg.generator} or provide the file)`);
  }

  const txt = fs.readFileSync(fp, 'utf8');
  const valid = cfg.validators.some(rx => rx.test(txt));
  if (!valid) {
    die(`[Rule] or [General] section missing or malformed in ${cfg.name}`);
  }
  log(`Validated text config: ${cfg.name}`);
}

// Validate stash.yaml (strict)
(() => {
  const fp = path.join(CONF_DIR, 'stash.yaml');
  if (!existsAndNonEmpty(fp)) die(`stash.yaml missing or empty: ${fp}`);
  try {
    const doc = yaml.load(fs.readFileSync(fp, 'utf8'));
    const must = ['proxies', 'proxy-groups', 'rules'];
    must.forEach(k => {
      if (!doc || !doc[k] || !Array.isArray(doc[k])) die(`stash.yaml missing or invalid key: ${k}`);
    });
    log('Validated stash.yaml (proxies, groups, rules)');
  } catch (e) { die(`invalid YAML stash.yaml: ${e.message}`); }
})();

// Validate mobileconfig files (flexible)
(() => {
  const files = fs.existsSync(CONF_DIR) ? fs.readdirSync(CONF_DIR).filter(f => f.endsWith('.mobileconfig')) : [];
  if (files.length === 0) {
    log('No .mobileconfig files present (optional)');
    return;
  }
  files.forEach(f => {
    const fp = path.join(CONF_DIR, f);
    try {
      const p = plist.parse(fs.readFileSync(fp, 'utf8'));
      if (!p || (!p.PayloadContent && !p.PayloadType)) {
        die(`mobileconfig seems malformed or missing expected top-level payloads: ${fp}`);
      }
      log(`Validated mobileconfig: ${f}`);
    } catch (e) { die(`invalid mobileconfig plist (${f}): ${e.message}`); }
  });
})();

// Pipeline report diagnostics (if present)
(() => {
  const rpt = path.join(OBF_DIR, 'pipeline-report.json');
  if (!existsAndNonEmpty(rpt)) {
    warn('pipeline-report.json not found; continuing without pipeline-report diagnostics');
    return;
  }
  try {
    const rep = JSON.parse(fs.readFileSync(rpt, 'utf8'));
    if (Array.isArray(rep.files)) {
      const failed = rep.files.filter(x => x.error);
      if (failed.length) {
        console.error('❌ Obfuscator reported errors for files:');
        failed.forEach(f => console.error(` - ${f.src}: ${f.error}`));
        die('Obfuscator produced errors (see pipeline-report.json)');
      }
      log(`pipeline-report: ${rep.files.length} file entries read`);
    }
  } catch (e) {
    warn(`Could not parse pipeline-report.json: ${e.message}`);
  }
})();

// Validate manifest-driven obfuscated payloads
(() => {
  const payloads = readManifestPayloads();
  if (!payloads.length) die('manifest.json contains no payload entries');

  let missingCount = 0;
  payloads.forEach(p => {
    const candidates = expectedObfFilesFromPayload(p);
    const found = candidates.find(c => existsAndNonEmpty(c));
    if (!found) {
      console.error(`❌ Missing obfuscated payload for manifest entry: ${p}`);
      console.error('   Expected one of (checked in this order):');
      candidates.forEach(c => console.error(`     - ${path.relative(ROOT, c)}`));
      missingCount++;
    } else {
      const metaPath = found.replace(/(\.ob\.js|\.js)$/, '.ob.js.meta.json');
      const altMeta = found + '.meta.json';
      const metaToRead = existsAndNonEmpty(metaPath) ? metaPath : (existsAndNonEmpty(altMeta) ? altMeta : null);
      if (!metaToRead) {
        const b64Meta = found.replace(/(\.ob\.js|\.js)$/, '.meta.json');
        if (existsAndNonEmpty(b64Meta)) {
          log(`Using legacy metadata file: ${path.relative(ROOT, b64Meta)}`);
        } else {
          warn(`metadata JSON not found for ${path.relative(ROOT, found)} (expected ${path.relative(ROOT, metaPath)} or ${path.relative(ROOT, altMeta)})`);
        }
      } else {
        try {
          const m = JSON.parse(fs.readFileSync(metaToRead, 'utf8'));
          const hash =
            (m && m.obfuscated && m.obfuscated.hash) ||
            (m && m.integrity && m.integrity.hash) ||
            (m && m.hash) ||
            (m && m.metadata && m.metadata.hash);
          if (!hash) {
            warn(`metadata for ${path.relative(ROOT, found)} present but missing expected hash fields: ${path.relative(ROOT, metaToRead)}`);
          } else {
            log(`Validated obfuscated payload: ${path.relative(ROOT, found)} (metadata hash ok)`);
          }
        } catch (e) {
          warn(`Could not parse metadata JSON ${path.relative(ROOT, metaToRead)}: ${e.message}`);
        }
      }
    }
  });

  if (missingCount > 0) die(`Validation failed: ${missingCount} obfuscated payload(s) missing`);
})();

// Optional: Check qrcodes manifest present
(() => {
  const q = path.join(PUBLIC_DIR, 'qrcodes', 'qrcodes.json');
  if (existsAndNonEmpty(q)) {
    try {
      const j = JSON.parse(fs.readFileSync(q, 'utf8'));
      if (!j.targets || !Array.isArray(j.targets)) {
        warn('qrcodes/qrcodes.json present but missing targets array');
      } else {
        log(`qrcodes.json present with ${j.targets.length} targets`);
      }
    } catch (e) {
      warn(`qrcodes.json invalid JSON: ${e.message}`);
    }
  } else {
    warn('qrcodes.json not found; QR generation may have fallen back to URL-only');
  }
})();

console.log('\x1b[32m✅ All configs, obfuscated scripts, and manifest payloads validated successfully\x1b[0m');
process.exit(0);