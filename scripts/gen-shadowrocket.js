#!/usr/bin/env node
/**
 * Build Shadowrocket .conf from configs/master-rules.yaml
 *
 * Output: apps/loader/public/configs/shadowrocket.conf
 * Needs : node, js-yaml
 *
 * Env:
 *   DNS_SERVER        (default 1.1.1.1)
 *   MASTER_RULES      (override master-rules path)
 *   SHADOW_GROUP_NAME (default Proxy)
 */

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT   = path.resolve(__dirname, '..');
const IN_YAML= process.env.MASTER_RULES || path.join(ROOT, 'configs/master-rules.yaml');
const OUTDIR = path.join(ROOT, 'apps/loader/public/configs');
const OUT    = path.join(OUTDIR, 'shadowrocket.conf');

const DNS    = process.env.DNS_SERVER || '1.1.1.1';
const GROUP  = process.env.SHADOW_GROUP_NAME || 'Proxy';

/* ---------- helpers ---------- */
const readYaml = fp => yaml.load(fs.readFileSync(fp, 'utf8'));
const join     = arr => arr.filter(Boolean).join(', ');

function shadowProxy(p) {
  const common = [p.type, p.host, p.port, p.user, p.pass].filter(Boolean);

  /* flags */
  const flags = [];
  if (p.tls)  flags.push('tls=true');
  if (p['fast_open']) flags.push('fast-open=false');          // SR syntax
  if (p.ws) {
    flags.push('ws=true');
    flags.push(`ws-path=${p.ws_path || '/'}`);
  }
  if (p.servername) flags.push(`tls-host=${p.servername}`);

  return `${p.name} = ${join([...common, ...flags])}`;
}

function buildProxySection(proxiesObj) {
  const lines = [];
  Object.values(proxiesObj || {}).forEach(list =>
    list.forEach(p => lines.push(shadowProxy(p))));
  return lines;
}

function buildGroupSection(groups) {
  return Object.entries(groups || {})
    .map(([name, list]) => `${name} = select, ${join([...list, 'DIRECT'])}`);
}

function ruleToLine(r) {
  const type = r.type?.toUpperCase();
  const v    = r.value;
  const g    = r.group || GROUP;
  switch (type) {
    case 'DOMAIN':
    case 'DOMAIN-SUFFIX':
    case 'DOMAIN-KEYWORD':
    case 'GEOIP':
    case 'IP-CIDR':
    case 'SRC-IP-CIDR':
    case 'URL-REGEX':
    case 'DST-PORT':
      return `${type},${v},${g}`;
    default:
      return null;
  }
}

/* ---------- main ---------- */
const doc = readYaml(IN_YAML);

/* [General] */
const general = [
  '[General]',
  `dns-server = ${DNS}`,
  'ipv6 = false',
  'udp-relay = true',
  'bypass-system = true',
  'skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local',
  ''
];

/* [Proxy] */
const proxySec = ['[Proxy]', ...buildProxySection(doc.proxies)].concat('');
/* [Proxy Group] */
const groupSec = ['[Proxy Group]', ...buildGroupSection(doc.groups)].concat('');

/* [Rule] */
const ruleLines = (doc.rules || []).map(ruleToLine).filter(Boolean);
const ersLines  = (doc.external_rule_sets || []).map(e => `RULE-SET,${e.url},${e.group}`);
const blockLines= (doc.block_domains || []).map(d => `DOMAIN-SUFFIX,${d},REJECT`);
const ruleSec   = ['[Rule]', ...ruleLines, ...ersLines, ...blockLines, `FINAL,${GROUP}`, ''];

/* [Script] */
const scriptSec = doc.scripts?.loader_url
  ? ['[Script]', `MITM-LOADER = type=http-response,pattern=https?:\\/\\/.+,script-path=${doc.scripts.loader_url}`, '']
  : [];

/* [MITM] */
let mitmSec = [];
if (doc.mitm_hostnames?.length) {
  mitmSec = ['[MITM]', `enable = true`, `hostname = ${doc.mitm_hostnames.join(',')}`, ''];
}

/* ---------- write ---------- */
const finalConf = [
  ...general,
  ...proxySec,
  ...groupSec,
  ...ruleSec,
  ...scriptSec,
  ...mitmSec
].join('\n');

fs.mkdirSync(OUTDIR, { recursive: true });
fs.writeFileSync(OUT, finalConf);
console.log('✓ shadowrocket.conf →', path.relative(ROOT, OUT));
