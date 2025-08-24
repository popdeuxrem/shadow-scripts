#!/usr/bin/env node
/**
 * scripts/gen-stash.js
 * Build Stash/Clash-style config from configs/master-rules.yaml
 *
 * Input shape (master-rules.yaml):
 *   proxies:
 *     us: [ { type: vless|http|socks5, name, host, port, ... }, ... ]
 *   groups:
 *     US: [ "PROXY_NAME", ... ]
 *   rules: [ { type, value, group?, no_resolve? }, ... ]
 *   external_rule_sets: [ { url, group }, ... ]
 *
 * Output:
 *   apps/loader/public/configs/stash.conf
 */
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT       = path.resolve(__dirname, '..');
const IN_FILE    = path.join(ROOT, 'configs', 'master-rules.yaml');
const OUT_DIR    = path.join(ROOT, 'apps/loader/public/configs');
const OUT_FILE   = path.join(OUT_DIR, 'stash.conf');

const die = (m) => { console.error(m); process.exit(1); };
const has = (o,k) => Object.prototype.hasOwnProperty.call(o,k);

if (!fs.existsSync(IN_FILE)) die(`missing ${path.relative(ROOT, IN_FILE)}`);

const master = yaml.load(fs.readFileSync(IN_FILE, 'utf8')) || {};
const proxiesByRegion = master.proxies || {};
const groups = master.groups || {};
const rules = Array.isArray(master.rules) ? master.rules : [];
const ers   = Array.isArray(master.external_rule_sets) ? master.external_rule_sets : [];

/* ---------- proxy mapping to Stash/Clash syntax ---------- */
function mapProxy(p) {
  const t = (p.type || '').toLowerCase();
  if (t === 'http') {
    const o = {
      name: p.name, type: 'http', server: p.host, port: Number(p.port)
    };
    if (p.user) o.username = p.user;
    if (p.pass) o.password = p.pass;
    return o;
  }
  if (t === 'socks5' || t === 'socks') {
    const o = {
      name: p.name, type: 'socks5', server: p.host, port: Number(p.port)
    };
    if (p.user) o.username = p.user;
    if (p.pass) o.password = p.pass;
    return o;
  }
  if (t === 'vless') {
    // Clash.Meta / Stash VLESS over WS+TLS
    const o = {
      name: p.name,
      type: 'vless',
      server: p.host,
      port: Number(p.port),
      uuid: p.user || p.uuid || '',
      tls: !!p.tls,
      servername: p.servername || p.sni || p.host,
      network: p.ws ? 'ws' : 'tcp',
    };
    if (o.network === 'ws') {
      o['ws-opts'] = { path: p.ws_path || p['ws-path'] || '/', headers: {} };
    }
    if (has(p,'skip-cert-verify')) o['skip-cert-verify'] = !!p['skip-cert-verify'];
    return o;
  }
  // pass-through as-is if unknown type
  return { name: p.name, type: t || 'direct' };
}

function collectProxies() {
  const out = [];
  for (const region of Object.keys(proxiesByRegion)) {
    for (const p of (proxiesByRegion[region] || [])) {
      out.push(mapProxy(p));
    }
  }
  return out;
}

/* ---------- proxy-groups ---------- */
function buildGroups() {
  const out = [];
  for (const gname of Object.keys(groups)) {
    const members = groups[gname] || [];
    out.push({ name: gname, type: 'select', proxies: [...members, 'DIRECT'] });
  }
  // global convenience
  out.push({
    name: 'Proxy',
    type: 'select',
    proxies: [...Object.keys(groups), 'DIRECT']
  });
  return out;
}

/* ---------- rule-providers from external_rule_sets ---------- */
function buildRuleProviders() {
  const providers = {};
  ers.forEach((r, idx) => {
    const name = new URL(r.url).pathname.split('/').pop().replace(/\.list$/,'') || `ext${idx}`;
    providers[name] = {
      type: 'http',
      behavior: 'domain',
      url: r.url,
      path: `./rules/${name}.list`,
      interval: 86400,
    };
  });
  return providers;
}

/* ---------- rules -> Clash/Stash rule lines ---------- */
function mapRule(r) {
  const t = String(r.type || '').toUpperCase();
  const v = String(r.value || '').trim();
  const g = String(r.group || 'Proxy');
  const nr = r.no_resolve ? ',no-resolve' : '';
  switch (t) {
    case 'DOMAIN':
    case 'DOMAIN-SUFFIX':
    case 'DOMAIN-KEYWORD':
    case 'GEOIP':
    case 'IP-CIDR':
    case 'SRC-IP-CIDR':
      return `${t},${v},${g}${nr}`;
    case 'DST-PORT':
    case 'URL-REGEX':
      // Supported by Stash; keep as raw string
      return `${t},${v},${g}`;
    default:
      return null;
  }
}

function buildRules() {
  const out = [];

  // Prefer secure DNS via proxy (optional starter)
  out.push('DST-PORT,53,REJECT');

  // master rules
  for (const r of rules) {
    const line = mapRule(r);
    if (line) out.push(line);
  }

  // external rule sets reference
  ers.forEach((r, idx) => {
    const name = new URL(r.url).pathname.split('/').pop().replace(/\.list$/,'') || `ext${idx}`;
    const group = r.group || 'Proxy';
    out.push(`RULE-SET,${name},${group}`);
  });

  // final
  out.push('FINAL,Proxy');
  return out;
}

/* ---------- assemble full config ---------- */
const stash = {
  'mixed-port': 7890,
  'allow-lan': true,
  'mode': 'Rule',
  'ipv6': false,
  'log-level': 'info',
  'dns': {
    enable: true,
    ipv6: false,
    'enhanced-mode': 'fake-ip',
    nameserver: ['1.1.1.1', '8.8.8.8'],
    'fallback': ['https://freedns.controld.com/p2', 'https://dns.cloudflare.com/dns-query'],
  },
  'proxies': collectProxies(),
  'proxy-groups': buildGroups(),
  'rule-providers': buildRuleProviders(),
  'rules': buildRules(),
};

/* ---------- write ---------- */
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, yaml.dump(stash, { lineWidth: 120 }));
console.log('Wrote', path.relative(ROOT, OUT_FILE));
