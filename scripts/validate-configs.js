#!/usr/bin/env node
/**
 * scripts/validate-configs.js
 * Fail the build if any generated config is empty or malformed.
 */
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const plist= require('plist');

const ROOT       = path.resolve(__dirname, '..');
const CONF_DIR   = path.join(ROOT, 'apps/loader/public/configs');
const OBF_DIR    = path.join(ROOT, 'apps/loader/public/obfuscated');
const PUBLIC_DIR = path.join(ROOT, 'apps/loader/public');
const die = m => { console.error(`❌ ${m}`); process.exit(1); };

const expectFile = (fp, msg='file missing') => {
  if (!fs.existsSync(fp) || fs.statSync(fp).size === 0) die(`${msg}: ${fp}`);
};

/* ── plain-text configs ───────────────────────────────────── */
['shadowrocket.conf', 'loon.conf'].forEach(f => {
  const fp = path.join(CONF_DIR, f);
  expectFile(fp);
  const txt = fs.readFileSync(fp, 'utf8');
  if (!/\[Rule]/i.test(txt)) die(`[Rule] section missing in ${f}`);
});

/* ── stash YAML ───────────────────────────────────────────── */
(() => {
  const fp = path.join(CONF_DIR, 'stash.conf');
  expectFile(fp);
  try {
    const doc = yaml.load(fs.readFileSync(fp, 'utf8'));
    ['proxies', 'proxy-groups', 'rules'].forEach(k => {
      if (!Array.isArray(doc[k])) die(`stash.conf missing key: ${k}`);
    });
  } catch (e) { die(`invalid YAML stash.conf: ${e.message}`); }
})();

/* ── mobileconfig plist ───────────────────────────────────── */
(() => {
  const fp = path.join(CONF_DIR, 'stealth-dns.mobileconfig');
  if (!fs.existsSync(fp)) return;                 // optional
  try {
    const p = plist.parse(fs.readFileSync(fp, 'utf8'));
    const dns = p.PayloadContent?.[0]?.DNSSettings;
    if (!dns?.ServerAddresses?.length) die('mobileconfig without DNS servers');
  } catch (e) { die(`invalid mobileconfig plist: ${e.message}`); }
})();

/* ── manifest.json integrity ───────────────────────────────── */
(() => {
  const fp = path.join(PUBLIC_DIR, 'manifest.json');
  expectFile(fp, 'manifest missing');
  let arr;
  try { arr = JSON.parse(fs.readFileSync(fp, 'utf8')); }
  catch (e) { die('manifest.json not valid JSON'); }
  if (!Array.isArray(arr)) die('manifest.json is not an array');
  arr.forEach(f => {
    const p = path.join(OBF_DIR, f);
    expectFile(p, '.js.b64 not found / empty');
  });
})();

console.log('✓ all configs validated');
