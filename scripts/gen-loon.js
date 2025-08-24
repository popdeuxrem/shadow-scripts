#!/usr/bin/env node
// scripts/gen-loon.js
// ------------------------------------------------------------
// • Needs: node, js-yaml, uuid (for MITM CA UUID)
// • Env vars: MASTER_RULES, DNS_SERVER (default 1.1.1.1)
// ------------------------------------------------------------
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');

const ROOT     = path.resolve(__dirname, '..');
const SRC_YAML = process.env.MASTER_RULES || 'configs/master-rules.yaml';
const OUT_DIR  = path.join(ROOT, 'apps/loader/public/configs');
const OUT_FILE = path.join(OUT_DIR, 'loon.conf');
const DNS      = process.env.DNS_SERVER || '1.1.1.1';

/* helpers --------------------------------------------------- */
const load = fp => yaml.load(fs.readFileSync(fp, 'utf8'));
const join = arr => arr.filter(Boolean).join(', ');

function loonProxy(p) {
  const base = [p.type, p.host, p.port, p.user, p.pass]
    .filter(Boolean);
  const flags = [];
  if (p.tls)  flags.push('tls=1');
  if (p.ws)   flags.push(`ws=${p.ws_path || '/'}`);
  if (p.fast_open) flags.push('fast-open=1');
  if (p.servername) flags.push(`sni=${p.servername}`);
  return `${p.name} = ${join([...base, ...flags])}`;
}

/* build ----------------------------------------------------- */
const doc = load(SRC_YAML);
const out = [];

/* GENERAL (minimal) */
out.push('[General]');
out.push(`dns-server = ${DNS}\n`);

/* PROXY */
out.push('[Proxy]');
Object.values(doc.proxies || {}).forEach(arr =>
  arr.forEach(p => out.push(loonProxy(p))));
out.push('');

/* PROXY GROUP */
out.push('[Proxy Group]');
Object.entries(doc.groups || {})
  .forEach(([g,list]) => out.push(`${g} = select, ${join(list)}`));
out.push('');

/* RULE */
out.push('[Rule]');
(doc.rules || []).forEach(r =>
  out.push(typeof r === 'string'
    ? r
    : `${r.type}, ${r.value}, ${r.group}`));
(doc.external_rule_sets || []).forEach(e =>
  out.push(`RULE-SET, ${e.url}, ${e.group}`));
(doc.block_domains || []).forEach(d =>
  out.push(`DOMAIN-SUFFIX, ${d}, REJECT`));
out.push('FINAL, Proxy', '');

/* SCRIPT (optional loader) */
if (doc.scripts?.loader_url) {
  out.push('[Script]');
  out.push(`http-response ^https?://.+ script-response-body ${doc.scripts.loader_url}`);
  out.push('');
}

/* MITM */
if (doc.mitm_hostnames?.length) {
  out.push('[MITM]');
  out.push(`skip-server-cert-check = true`);
  out.push(`hostname = ${join(doc.mitm_hostnames)}`);
  out.push(`CA = ${uuidv4().toUpperCase()}.cer\n`);
}

/* WRITE ----------------------------------------------------- */
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, out.join('\n'));
console.log('✓ loon.conf →', path.relative(ROOT, OUT_FILE));
