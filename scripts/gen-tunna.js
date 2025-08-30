#!/usr/bin/env node
/**
 * gen-tunna.js – Create minimalist Tunnel YAML (aka “Tunna”)
 *
 * Output: apps/loader/public/configs/tunna.yaml
 * Author : PopdeuxRem • 2025-08-29
 */
const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT     = path.resolve(__dirname, '..');
const SRC      = path.join(ROOT, 'configs', 'master-rules.yaml');
const OUT      = path.join(ROOT, 'apps', 'loader', 'public', 'configs', 'tunna.yaml');
const DOC      = yaml.load(fs.readFileSync(SRC, 'utf8')) || {};

// Base skeleton ----------------------------------------------------------------
const cfg = {
  mode       : 'Rule',
  log-level  : 'info',
  dns        : { enable: true, default-nameserver: ['1.1.1.1', '8.8.8.8'] },
  proxies    : [],
  'proxy-groups': [],
  rules      : [],
};

// Proxies ----------------------------------------------------------------------
(DOC.proxies?.us || []).forEach(p => {
  cfg.proxies.push({
    name  : p.name,
    type  : p.type || 'socks5',
    server: p.host,
    port  : p.port,
    username: p.user,
    password: p.pass,
    uuid  : p.user,          // for vless/vmess
    tls   : !!p.tls,
    'udp-relay': true,
    ...(p.ws && { 'obfs': 'ws', 'obfs-uri': p.ws_path || '/' })
  });
});

// Groups -----------------------------------------------------------------------
cfg['proxy-groups'].push({
  name   : 'US',
  type   : 'select',
  proxies: cfg.proxies.map(x => x.name).concat('DIRECT')
});

// Rules ------------------------------------------------------------------------
(DOC.rules || []).forEach(r => {
  if (typeof r === 'string') { cfg.rules.push(r); return; }
  if (!r || !r.type || !r.value) return;
  cfg.rules.push(`${r.type},${r.value},${r.group || 'US'}`);
});
(DOC.block_domains || []).forEach(d => cfg.rules.push(`DOMAIN-SUFFIX,${d},REJECT`));
cfg.rules.push('MATCH,DIRECT');

// Write ------------------------------------------------------------------------
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, yaml.dump(cfg), 'utf8');
console.log(`✅  tunna.yaml generated → ${OUT}`);
