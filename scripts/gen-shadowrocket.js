// scripts/gen-shadowrocket.js
//
// Convert configs/master-rules.yaml  →  apps/loader/public/configs/shadowrocket.conf
//
// Requires: js-yaml (yaml parsing)
//
// $ pnpm add -D js-yaml
//
// Called automatically from build-all.sh

const fs   = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const ROOT     = path.resolve(__dirname, '..');
const YAML_SRC = path.join(ROOT, 'configs', 'master-rules.yaml');
const OUT_DIR  = path.join(ROOT, 'apps', 'loader', 'public', 'configs');
const OUT_FILE = path.join(OUT_DIR, 'shadowrocket.conf');

function loadYaml() {
  const raw = fs.readFileSync(YAML_SRC, 'utf8');
  return yaml.load(raw) || {};
}

/* ---------- helpers ---------- */
const join = (arr, sep = ',') => arr.filter(Boolean).join(sep);

function renderGeneral(g) {
  const out = ['[General]'];
  if (g.bypass_system) out.push('bypass-system = true');
  if (g.skip_proxy)   out.push(`skip-proxy = ${join(g.skip_proxy, ', ')}`);
  if (g.bypass_tun)   out.push(`bypass-tun = ${join(g.bypass_tun, ',')}`);
  if (g.dns)          out.push(`dns-server = ${g.dns}`);
  if (g.ipv6 === false) out.push('ipv6 = false');
  if (g.udp_relay)    out.push('udp-relay = true');
  out.push('');
  return out.join('\n');
}

function renderProxies(doc) {
  const out = ['[Proxy]'];
  for (const region of Object.keys(doc.proxies || {})) {
    for (const p of doc.proxies[region]) {
      const { type, name, host, port, user, pass, ...flags } = p;
      const items = [type, host, port];
      if (user) items.push(user);
      if (pass) items.push(pass);
      for (const [k, v] of Object.entries(flags)) {
        if (typeof v === 'boolean') items.push(`${k}=${v}`);
        else items.push(`${k}=${v}`);
      }
      out.push(`${name} = ${items.join(', ')}`);
    }
  }
  out.push('');
  return out.join('\n');
}

function renderGroups(doc) {
  const out = ['[Proxy Group]'];
  for (const gname of Object.keys(doc.groups || {})) {
    const proxies = join(doc.groups[gname], ',');
    out.push(`${gname} = select,${proxies}`);
  }
  out.push('');
  return out.join('\n');
}

function ruleLine(r) {
  const { type, value, group } = r;
  return `${type},${value},${group}`;
}

function renderRules(doc) {
  const out = ['[Rule]'];
  (doc.rules || []).forEach(r => out.push(ruleLine(r)));
  // block_domains → REJECT
  (doc.block_domains || []).forEach(d => out.push(`DOMAIN-SUFFIX,${d},REJECT`));
  out.push('');
  return out.join('\n');
}

function renderMitm(doc) {
  if (!doc.mitm_hostnames) return '';
  return `[MITM]\nhostname = ${join(doc.mitm_hostnames, ',')}\n`;
}

function renderScript(doc) {
  if (!doc.scripts?.loader_url) return '';
  return `[Script]\nhttp-response ^https?:\/\/(.+\\.)?(openai|stripe|paypal) script-response-body ${doc.scripts.loader_url}\n`;
}

/* ---------- main ---------- */
(function main() {
  const doc = loadYaml();

  const sections = [
    renderGeneral(doc.general || {}),
    renderProxies(doc),
    renderGroups(doc),
    renderRules(doc),
    renderMitm(doc),
    renderScript(doc),
    'FINAL,Proxy\n', // default fallback
  ];

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, sections.filter(Boolean).join('\n'));
  console.log('✓ shadowrocket.conf generated →', path.relative(ROOT, OUT_FILE));
})();
