#!/usr/bin/env node
/* Build Shadowrocket config from master-rules.yaml */

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';

const root   = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const src    = path.join(root, 'configs', 'master-rules.yaml');
const outDir = path.join(root, 'apps', 'loader', 'public', 'configs');
const out    = path.join(outDir, 'shadowrocket.conf');

const yml = yaml.load(fs.readFileSync(src, 'utf8'));

const buf = [];

/* ---------- General ---------- */
buf.push('[General]');
buf.push(`dns-server = ${yml.dns || '1.1.1.1'}`);
buf.push('');

/* ---------- Proxy ---------- */
buf.push('[Proxy]');
for (const region in yml.proxies || {}) {
  for (const p of yml.proxies[region]) {
    const line = [
      p.name,
      p.type,
      p.host,
      p.port,
      p.user      && p.user,
      p.pass      && p.pass,
      p.tls       && 'tls=true',
      p.ws        && 'ws=true',
      p.ws_path   && `ws-path=${p.ws_path}`,
      p.servername&& `servername=${p.servername}`,
      p.fast_open !== undefined && `fast-open=${p.fast_open}`
    ].filter(Boolean).join(', ');
    buf.push(line);
  }
}
buf.push('');

/* ---------- Proxy Group ---------- */
buf.push('[Proxy Group]');
for (const g in yml.groups || {})
  buf.push(`${g} = select, ${yml.groups[g].join(', ')}`);
buf.push('Auto-All = select, DIRECT, ' + Object.values(yml.groups || {})
    .flat().join(', '));
buf.push('');

/* ---------- Rules ---------- */
buf.push('[Rule]');
(yml.rules || []).forEach(r => {
  if (typeof r === 'string') buf.push(r);
  else                        buf.push(`${r.type},${r.value},${r.group}`);
});
(yml.external_rule_sets || []).forEach(x =>
  buf.push(`RULE-SET,${x.url},${x.group}`));
(yml.block_domains || []).forEach(d =>
  buf.push(`DOMAIN-SUFFIX,${d},REJECT`));
buf.push('FINAL,Auto-All');

/* ---------- MITM ---------- */
if (yml.mitm_hostnames?.length) {
  buf.push('\n[MITM]');
  buf.push('hostname = ' + yml.mitm_hostnames.join(','));
}

/* ---------- Script ---------- */
if (yml.scripts?.loader_url) {
  buf.push('\n[Script]');
  buf.push(`http-response ^https?:\/\/.+ script-response-body ${yml.scripts.loader_url}`);
}

/* ---------- Write file ---------- */
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(out, buf.join('\n') + '\n');
console.log('✅  Shadowrocket config written to', out);
