#!/usr/bin/env node
/**
 * Build Shadowrocket config  
 * master-rules.yaml  ➞  apps/loader/public/configs/shadowrocket.conf
 *
 *  • supports full `general` block (bypass-system, skip-proxy, bypass-tun …)
 *  • converts every proxy entry, proxy-group, rule, external rule-set
 *  • appends MITM and Script sections when present
 */
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT   = path.resolve(__dirname, '..');
const YAML   = path.join(ROOT, 'configs/master-rules.yaml');
const OUTDIR = path.join(ROOT, 'apps/loader/public/configs');
const OUT    = path.join(OUTDIR, 'shadowrocket.conf');

/* ── helpers ──────────────────────────────────────────────────────────────── */
const j = a => a.filter(Boolean).join(', ');          // join + drop blanks
const yes = v => v === true || v === 'true';

/* ── build sections ──────────────────────────────────────────────────────── */
function sectionGeneral(g = {}) {
  const out = ['[General]'];
  if (yes(g.bypass_system))     out.push('bypass-system = true');
  if (g.skip_proxy?.length)     out.push(`skip-proxy = ${j(g.skip_proxy)}`);
  if (g.bypass_tun?.length)     out.push(`bypass-tun = ${j(g.bypass_tun)}`);
  if (g.dns)                    out.push(`dns-server = ${g.dns}`);
  if (g.ipv6 === false)         out.push('ipv6 = false');
  if (yes(g.udp_relay))         out.push('udp-relay = true');
  out.push('');
  return out.join('\n');
}

function sectionProxy(doc) {
  const out = ['[Proxy]'];
  for (const region of Object.keys(doc.proxies || {})) {
    for (const p of doc.proxies[region]) {
      const flags = Object.entries(p)
        .filter(([k]) => !['type','name','host','port','user','pass'].includes(k))
        .map(([k,v]) => `${k}=${v}`);
      out.push(
        `${p.name} = ${j([
          p.type, p.host, p.port, p.user, p.pass, ...flags
        ])}`
      );
    }
  }
  out.push('');
  return out.join('\n');
}

function sectionGroups(doc) {
  const out = ['[Proxy Group]'];
  for (const g of Object.keys(doc.groups || {}))
    out.push(`${g} = select,${j(doc.groups[g])}`);
  out.push('');
  return out.join('\n');
}

function ruleLine(r) {
  if (typeof r === 'string') return r;          // raw string passthrough
  return `${r.type},${r.value},${r.group}`;
}

function sectionRules(doc) {
  const out = ['[Rule]'];
  (doc.rules || []).forEach(r => out.push(ruleLine(r)));
  (doc.external_rule_sets || [])
    .forEach(e => out.push(`RULE-SET,${e.url},${e.group}`));
  (doc.block_domains || [])
    .forEach(d => out.push(`DOMAIN-SUFFIX,${d},REJECT`));
  out.push('FINAL,Proxy', '');                  // default fallback
  return out.join('\n');
}

const sectionMitm   = d => d.mitm_hostnames?.length
  ? `[MITM]\nhostname = ${j(d.mitm_hostnames)}\n`
  : '';

const sectionScript = d => d.scripts?.loader_url
  ? `[Script]\nhttp-response ^https?:\/\/.+ script-response-body ${d.scripts.loader_url}\n`
  : '';

/* ── main ─────────────────────────────────────────────────────────────────── */
const doc = yaml.load(fs.readFileSync(YAML, 'utf8')) || {};

const config = [
  sectionGeneral(doc.general || {}),
  sectionProxy(doc),
  sectionGroups(doc),
  sectionRules(doc),
  sectionMitm(doc),
  sectionScript(doc)
].filter(Boolean).join('\n');

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, config);
console.log('✓ shadowrocket.conf →', path.relative(ROOT, OUT));
