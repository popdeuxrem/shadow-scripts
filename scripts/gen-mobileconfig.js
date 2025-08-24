// scripts/gen-mobileconfig.js
// Build valid Apple profiles from configs/master-rules.yaml
// Outputs:
//  - apps/loader/public/configs/stealth-dns.mobileconfig
//  - apps/loader/public/configs/http-proxy.mobileconfig  (if HTTP proxy found)
//  - apps/loader/public/configs/network-bundle.mobileconfig (DNS + HTTP)
// Notes: iOS accepts only Apple payload types. No app-specific Shadowrocket payloads.

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const plist = require('plist');
const { randomUUID } = require('crypto');

const ROOT   = path.resolve(__dirname, '..');
const SRC    = path.join(ROOT, 'configs', 'master-rules.yaml');
const OUTDIR = path.join(ROOT, 'apps/loader/public/configs');

const ORG    = 'Shadow Scripts';
const ISSUER = 'shadow-scripts';
const dnsFromEnv = process.env.DNS_SERVER || null;

// ---------- helpers ----------
const uuid = () => randomUUID();
const load = () => yaml.load(fs.readFileSync(SRC, 'utf8')) || {};

function allProxies(doc) {
  const out = [];
  for (const region of Object.keys(doc.proxies || {})) {
    for (const p of doc.proxies[region]) out.push(p);
  }
  return out;
}
function findHttpProxy(doc, preferGroup) {
  const proxies = allProxies(doc);
  // try group membership first
  if (preferGroup && doc.groups && doc.groups[preferGroup]) {
    const byName = new Map(proxies.map(p => [p.name, p]));
    for (const name of doc.groups[preferGroup]) {
      const p = byName.get(name);
      if (p && String(p.type).toLowerCase() === 'http') return p;
    }
  }
  // fallback: any HTTP proxy
  return proxies.find(p => String(p.type).toLowerCase() === 'http') || null;
}

function buildDnsPayload(addresses) {
  return {
    PayloadType: 'com.apple.dnsSettings.managed',
    PayloadVersion: 1,
    PayloadIdentifier: `${ISSUER}.dns.${uuid()}`,
    PayloadUUID: uuid(),
    PayloadDisplayName: 'DNS Settings',
    DNSSettings: { ServerAddresses: addresses }
  };
}

function buildHttpGlobalPayload(p) {
  // Apple global HTTP proxy payload
  // Keys: ProxyServer, ProxyServerPort, ProxyUsername, ProxyPassword
  const payload = {
    PayloadType: 'com.apple.proxy.http.global',
    PayloadVersion: 1,
    PayloadIdentifier: `${ISSUER}.proxy.http.${uuid()}`,
    PayloadUUID: uuid(),
    PayloadDisplayName: `HTTP Proxy (${p.name})`,
    ProxyServer: p.host,
    ProxyServerPort: Number(p.port),
  };
  if (p.user) payload.ProxyUsername = String(p.user);
  if (p.pass) payload.ProxyPassword = String(p.pass);
  return payload;
}

function writeProfile(filename, payloads, displayName, description) {
  const profile = {
    PayloadType: 'Configuration',
    PayloadVersion: 1,
    PayloadIdentifier: `${ISSUER}.${filename.replace(/\.mobileconfig$/,'')}`,
    PayloadUUID: uuid(),
    PayloadDisplayName: displayName,
    PayloadOrganization: ORG,
    PayloadDescription: description,
    PayloadContent: payloads
  };
  fs.mkdirSync(OUTDIR, { recursive: true });
  const out = path.join(OUTDIR, filename);
  fs.writeFileSync(out, plist.build(profile));
  console.log('Wrote', out);
}

// ---------- main ----------
(function main() {
  const doc = load();

  // DNS
  const dnsAddrs = dnsFromEnv
    ? [dnsFromEnv]
    : (doc.dns ? [String(doc.dns)] : ['1.1.1.1']);
  const dnsPayload = buildDnsPayload(dnsAddrs);
  writeProfile(
    'stealth-dns.mobileconfig',
    [dnsPayload],
    'Stealth DNS',
    `Sets system DNS: ${dnsAddrs.join(', ')}`
  );

  // HTTP Global Proxy (optional, only if present and supported)
  const preferGroup = process.env.MOBILECONFIG_GROUP || 'US';
  const http = findHttpProxy(doc, preferGroup);
  if (http) {
    const httpPayload = buildHttpGlobalPayload(http);
    writeProfile(
      'http-proxy.mobileconfig',
      [httpPayload],
      'HTTP Proxy (Global)',
      `Global HTTP proxy via ${http.host}:${http.port}`
    );

    // Bundle DNS + HTTP
    writeProfile(
      'network-bundle.mobileconfig',
      [dnsPayload, httpPayload],
      'Network Bundle (DNS + HTTP Proxy)',
      'Installs DNS and a global HTTP proxy in one profile'
    );
  } else {
    console.log('No HTTP proxy found in YAML. Skipped http-proxy.mobileconfig.');
  }
})();
