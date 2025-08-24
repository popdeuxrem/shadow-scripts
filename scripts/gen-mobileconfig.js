// scripts/gen-mobileconfig.js
//
// Builds signed-ready iOS profiles from configs/master-rules.yaml.
//
//  • stealth-dns.mobileconfig           (DNS only)
//  • http-proxy.mobileconfig            (Global HTTP proxy if one exists)
//  • network-bundle.mobileconfig        (DNS + HTTP proxy)
//  • shadow_config.mobileconfig         (alias bundle; Wi-Fi & Cellular on-demand)
//
// ENV OVERRIDES
//  • DNS_SERVER         preferred DNS (default 1.1.1.1)
//  • MOBILECONFIG_GROUP proxy-group name to search for HTTP proxy (default Proxy)

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import plist from 'plist';
import { randomUUID as uuid } from 'crypto';

const ROOT   = path.resolve(new URL('.', import.meta.url).pathname, '..', '..');
const SRC    = path.join(ROOT, 'configs', 'master-rules.yaml');
const OUTDIR = path.join(ROOT, 'apps', 'loader', 'public', 'configs');

const ORG    = 'Shadow Scripts';
const ISSUER = 'shadow-scripts';
const DNS    = process.env.DNS_SERVER || '1.1.1.1';
const PREFER = process.env.MOBILECONFIG_GROUP || 'Proxy';

/* ---------- helpers ---------- */
const load = () => yaml.load(fs.readFileSync(SRC, 'utf8')) ?? {};

function flattenProxies(doc) {
  const acc = [];
  for (const region of Object.keys(doc.proxies ?? {}))
    acc.push(...(doc.proxies[region] ?? []));
  return acc;
}
function pickHttp(doc) {
  const all = flattenProxies(doc);
  // prefer proxies whose name appears in the chosen group
  if (doc.groups?.[PREFER]) {
    const byName = new Map(all.map(p => [p.name, p]));
    for (const name of doc.groups[PREFER])
      if (byName.get(name)?.type?.toLowerCase() === 'http') return byName.get(name);
  }
  return all.find(p => p.type?.toLowerCase() === 'http') ?? null;
}

function dnsPayload(addr) {
  return {
    PayloadType: 'com.apple.dnsSettings.managed',
    PayloadVersion: 1,
    PayloadUUID: uuid(),
    PayloadIdentifier: `${ISSUER}.dns.${uuid()}`,
    PayloadDisplayName: `DNS ${addr}`,
    DNSSettings: { ServerAddresses: [addr] },
  };
}
function httpPayload(h) {
  const o = {
    PayloadType: 'com.apple.proxy.http.global',
    PayloadVersion: 1,
    PayloadUUID: uuid(),
    PayloadIdentifier: `${ISSUER}.proxy.http.${uuid()}`,
    PayloadDisplayName: `HTTP Proxy ${h.host}`,
    ProxyServer: h.host,
    ProxyServerPort: Number(h.port),
  };
  if (h.user) o.ProxyUsername = String(h.user);
  if (h.pass) o.ProxyPassword = String(h.pass);
  return o;
}

function write(file, display, desc, payloads) {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const profile = {
    PayloadType: 'Configuration',
    PayloadVersion: 1,
    PayloadUUID: uuid(),
    PayloadIdentifier: `${ISSUER}.${file.replace(/\.mobileconfig$/,'')}`,
    PayloadDisplayName: display,
    PayloadOrganization: ORG,
    PayloadDescription: desc,
    PayloadContent: payloads,
  };
  fs.writeFileSync(path.join(OUTDIR, file), plist.build(profile));
  console.log('✓', file);
}

/* ---------- main ---------- */
const doc = load();

// DNS-only profile
const dnsOnly = dnsPayload(DNS);
write('stealth-dns.mobileconfig',
      'Stealth DNS', `Sets system DNS to ${DNS}`, [dnsOnly]);

const http = pickHttp(doc);
if (!http) {
  console.log('No HTTP proxy in YAML – skipping http-proxy & bundle profiles.');
  process.exit(0);
}

// HTTP-only profile
const httpOnly = httpPayload(http);
write('http-proxy.mobileconfig',
      'Global HTTP Proxy',
      `Routes all traffic via ${http.host}:${http.port}`,
      [httpOnly]);

// DNS + HTTP bundle
const bundle = [dnsOnly, httpOnly];
write('network-bundle.mobileconfig',
      'DNS + HTTP Bundle', 'DNS override and global HTTP proxy', bundle);

// Alias for convenience
write('shadow_config.mobileconfig',
      'Shadow Config', 'Wi-Fi/Cellular on-demand DNS + HTTP proxy', bundle);
