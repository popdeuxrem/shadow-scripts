#!/usr/bin/env node
/**
 * master-rules.yaml -> stash.conf
 */
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT   = path.resolve(__dirname, '..');
const SRC    = path.join(ROOT, 'configs/master-rules.yaml');
const OUTDIR = path.join(ROOT, 'apps/loader/public/configs');
const OUT    = path.join(OUTDIR, 'stash.conf');

const doc = yaml.load(fs.readFileSync(SRC, 'utf8'));
const out = [];

/* ---------- General ---------- */
out.push('[General]');
out.push(`dns-server = ${doc.dns || '1.1.1.1'}`);
out.push('skip-proxy = 192.168.0.0/16, 10.0.0.0/8');
out.push('');

/* ---------- Proxy ---------- */
out.push('[Proxy]');
for (const region in doc.proxies || {}) {
  for (const p of doc.proxies[region]) {
    const line = [
      p.name,
      p.type,
      p.host,
      p.port,
      p.user && `username=${p.user}`,
      p.pass && `password=${p.pass}`,
      p.tls  && 'tls=true',
      p.ws   && 'ws=true',
      p.ws_path && `ws-path=${p.ws_path}`,
      p.fast_open !== undefined && `fast-open=${p.fast_open}`
    ].filter(Boolean).join(', ');
    out.push(line);
  }
}
out.push('');

/* ---------- Proxy Group ---------- */
out.push('[Proxy Group]');
for (const g in doc.groups || {}) {
  out.push(`${g} = select, ${doc.groups[g].join(', ')}`);
}
out.push('');

/* ---------- Rule ---------- */
out.push('[Rule]');
(doc.rules || []).forEach(r => {
  const str = typeof r === 'string'
    ? r
    : `${r.type},${r.value},${r.group}`;
  out.push(str);
});
(doc.external_rule_sets || []).forEach(e=>{
  out.push(`RULE-SET,${e.url},${e.group}`);
});
(doc.block_domains || []).forEach(d=>{
  out.push(`DOMAIN-SUFFIX,${d},REJECT`);
});
out.push('FINAL,Auto-All');

/* ---------- MITM ---------- */
if (doc.mitm_hostnames?.length) {
  out.push('\n[MITM]');
  out.push(`hostname = ${doc.mitm_hostnames.join(', ')}`);
}

/* ---------- Script ---------- */
if (doc.scripts?.loader_url) {
  out.push('\n[Script]');
  out.push(`http-response ^https?:\/\/.+ script-response-body ${doc.scripts.loader_url}`);
}

fs.mkdirSync(OUTDIR, {recursive:true});
fs.writeFileSync(OUT, out.join('\n') + '\n');
console.log('Wrote', OUT);
