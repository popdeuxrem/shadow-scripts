#!/usr/bin/env node
/**
 * Build Stash (Clash-compatible) config
 * master-rules.yaml ➜ apps/loader/public/configs/stash.conf
 *
 * Requirements: node, js-yaml
 */
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

/* ─ env / paths ────────────────────────────────────────────── */
const ROOT       = path.resolve(__dirname, '..');
const MASTER     = process.env.MASTER_RULES || 'configs/master-rules.yaml';
const OUT_DIR    = path.join(ROOT, 'apps/loader/public/configs');
const OUT_FILE   = path.join(OUT_DIR, 'stash.conf');
const DNS_SERVER = process.env.DNS_SERVER || '1.1.1.1';

/* ─ helpers ────────────────────────────────────────────────── */
const loadYaml = fp => yaml.load(fs.readFileSync(fp, 'utf8'));
const dump     = obj => yaml.dump(obj, { lineWidth: 100, noCompatMode: true });

function toClashProxy(p) {
  const base = { name: p.name, type: p.type, server: p.host, port: p.port };
  if (p.type === 'socks5' || p.type === 'http') {
    if (p.user) base.username = p.user;
    if (p.pass) base.password = p.pass;
  }
  if (p.type === 'vless' || p.type === 'vmess') {
    base.uuid   = p.user;
    base.tls    = !!p.tls;
    if (p.ws) {
      base.network  = 'ws';
      base['ws-path'] = p.ws_path || '/';
    }
    if (p.servername) base.sni = p.servername;
  }
  // copy passthrough flags
  ['ws', 'ws_path', 'fast_open'].forEach(k => {
    if (p[k] !== undefined) base[k] = p[k];
  });
  return base;
}

function buildConfig(doc) {
  /* proxies */
  const proxies = [];
  Object.values(doc.proxies || {}).forEach(arr =>
    arr.forEach(p => proxies.push(toClashProxy(p)))
  );

  /* groups */
  const pg = Object.entries(doc.groups || {}).map(([name, list]) => ({
    name, type: 'select', proxies: list
  }));

  /* rules */
  const clashRules = [];
  (doc.rules || []).forEach(r => {
    if (typeof r === 'string') clashRules.push(r);
    else clashRules.push(`${r.type},${r.value},${r.group}`);
  });
  (doc.external_rule_sets || []).forEach(e =>
    clashRules.push(`RULE-SET,${e.url},${e.group}`)
  );
  (doc.block_domains || []).forEach(d =>
    clashRules.push(`DOMAIN-SUFFIX,${d},REJECT`)
  );
  clashRules.push('FINAL,Proxy');

  /* dns */
  const dns = {
    enable: true,
    ipv6  : false,
    nameserver: [DNS_SERVER, '8.8.8.8'],
    fallback  : ['1.0.0.1']
  };

  return { proxies, 'proxy-groups': pg, rules: clashRules, dns };
}

/* ─ main ───────────────────────────────────────────────────── */
const doc = loadYaml(MASTER);
const cfg = buildConfig(doc);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, dump(cfg));
console.log('✓ stash.conf ->', path.relative(ROOT, OUT_FILE));
