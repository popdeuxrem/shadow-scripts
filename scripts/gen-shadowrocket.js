#!/usr/bin/env node
/**
 * Convert master-rules.yaml → shadowrocket.conf
 *  • supports structured proxies / groups / rules
 *  • outputs to apps/loader/public/configs/shadowrocket.conf
 */
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT   = path.resolve(__dirname, '..');
const SRC    = path.join(ROOT, 'configs/master-rules.yaml');
const OUTDIR = path.join(ROOT, 'apps/loader/public/configs');
const OUT    = path.join(OUTDIR, 'shadowrocket.conf');

const doc = yaml.load(fs.readFileSync(SRC, 'utf8'));

const out = [];

/* ---------- General ---------- */
const dns = doc.dns || '1.1.1.1';
out.push('[General]');
out.push(`dns-server = ${dns}`);
out.push('');

/* ---------- Proxy section ---------- */
out.push('[Proxy]');
for (const region in doc.proxies || {}) {
  for (const p of doc.proxies[region]) {
    const { type, name = `${type}-${region}`, host, port, user, pass,
            tls, ws, ws_path, fast_open, servername } = p;
    if (!type || !host || !port) continue;

    const parts = [
      name,
      type,
      host,
      port,
      user || '',
      pass || '',
      tls ? 'tls=true' : '',
      ws  ? 'ws=true'  : '',
      ws_path      ? `ws-path=${ws_path}`       : '',
      servername   ? `servername=${servername}` : '',
      fast_open !== undefined ? `fast-open=${fast_open}` : ''
    ].filter(Boolean);
    out.push(parts.join(', '));
  }
}
out.push('');

/* ---------- Proxy Group ---------- */
out.push('[Proxy Group]');
for (const gName in doc.groups || {}) {
  const members = doc.groups[gName].join(', ');
  out.push(`${gName} = select, ${members}`);
}
out.push('');

/* ---------- Rule ---------- */
out.push('[Rule]');
(doc.rules || []).forEach(r => {
  if (typeof r === 'string') {           // raw line
    out.push(r);
  } else if (r && typeof r === 'object') {
    const { type, value, group } = r;
    if (type && value && group) out.push(`${type},${value},${group}`);
  }
});

/* Optional: external rule-sets */
(doc.external_rule_sets || []).forEach(e => {
  if (e.url && e.group) out.push(`RULE-SET,${e.url},${e.group}`);
});

/* reject/block domains */
(doc.block_domains || []).forEach(d => out.push(`DOMAIN-SUFFIX,${d},REJECT`));

out.push('FINAL,Auto-All');   // fallback

/* ---------- MITM ---------- */
if (doc.mitm_hostnames && doc.mitm_hostnames.length) {
  out.push('\n[MITM]');
  out.push(`hostname = ${doc.mitm_hostnames.join(', ')}`);
}

/* ---------- Script ---------- */
if (doc.scripts && doc.scripts.loader_url) {
  out.push('\n[Script]');
  out.push(`http-response ^https?:\/\/(.+\\.)?(openai|stripe|paypal) script-response-body ${doc.scripts.loader_url}`);
}

/* ---------- write ---------- */
fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, out.join('\n') + '\n');
console.log('Wrote:', OUT);
