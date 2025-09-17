#!/usr/bin/env node
/**
 * scripts/gen-stash.js v2.0.0
 * ───────────────────────────────────────────────
 * Cyberpunk Futuristic Stash Config Generator
 *
 * Features:
 *  - Generates stealth-ready Stash proxy configs for iOS
 *  - Multi-protocol support: SOCKS5, VLESS, VMess, Trojan
 *  - Proxy groups: Proxy, Auto, Fallback, LoadBalance
 *  - Hardened DNS (Cloudflare + Google + DoH/DoT)
 *  - CI/CD-friendly JSON summary + SHA256 integrity
 *  - ES module-ready for Node 18+
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import crypto from "crypto";
import { execSync } from "child_process";

const VERSION = "2.0.0";
const INPUT = process.env.MASTER_RULES || path.join("configs", "master-rules.yaml");
const OUTPUT = process.env.STASH_OUT || path.join("apps/loader/public/configs/stash.yaml");

const CI_MODE = process.argv.includes("--ci");
const DRY_RUN = process.argv.includes("--dry-run");

const DEFAULT_DNS = [
  "1.1.1.1", "1.0.0.1",
  "8.8.8.8", "8.8.4.4"
];

function gitCommit() {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
}

function sha256(s) {
  return crypto.createHash("sha256").update(s).digest("hex");
}

function normalizeProxy(p, idx) {
  const base = {
    name: p.name || `proxy-${idx}`,
    type: (p.type || "socks5").toLowerCase(),
    server: p.host || p.server,
    port: parseInt(p.port, 10)
  };
  if (p.user) base.username = p.user;
  if (p.pass) base.password = p.pass;
  if (p.uuid) base.uuid = p.uuid;
  if (p.tls) base.tls = true;
  if (p.sni) base.sni = p.sni;
  if (p.alpn) base.alpn = p.alpn;
  return base;
}

function buildDNS() {
  return {
    enable: true,
    listen: "0.0.0.0:5353",
    ipv6: true,
    "enhanced-mode": "redir-host",
    nameserver: DEFAULT_DNS,
    fallback: [
      "https://1.1.1.1/dns-query",
      "https://dns.google/dns-query",
      "tls://1.1.1.1:853",
      "tls://8.8.8.8:853"
    ],
    "fallback-filter": { geoip: true, "geoip-code": "CN", ipcidr: ["240.0.0.0/4"] }
  };
}

function loadYAML(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf8");
    return yaml.load(raw) || {};
  } catch {
    return {};
  }
}

function build() {
  const doc = loadYAML(INPUT);

  // ─ Proxies
  const rawProxies = [];
  Object.values(doc.proxies || {}).forEach(arr => (arr || []).forEach(p => rawProxies.push(p)));
  const proxies = rawProxies.map(normalizeProxy);

  // ─ Proxy Groups
  const proxyNames = proxies.map(p => p.name);
  const groups = [{ name: "Proxy", type: "select", proxies: [...proxyNames, "DIRECT"] }];
  if (proxyNames.length > 1) {
    groups.push({ name: "Auto", type: "url-test", proxies: proxyNames, url: "http://www.gstatic.com/generate_204", interval: 300 });
    groups.push({ name: "Fallback", type: "fallback", proxies: [...proxyNames, "DIRECT"], url: "http://www.gstatic.com/generate_204", interval: 300 });
  }
  if (proxyNames.length > 2) {
    groups.push({ name: "LoadBalance", type: "load-balance", proxies: proxyNames, url: "http://www.gstatic.com/generate_204", interval: 300 });
  }

  // ─ Rules
  const rules = [];
  (doc.rules || []).forEach(r => {
    if (typeof r === "string") rules.push(r);
    else if (r.type && r.value) rules.push(`${r.type.toUpperCase()},${r.value},${r.group || "US"}`);
  });
  (doc.block_domains || []).forEach(d => rules.push(`DOMAIN-SUFFIX,${d},REJECT`));
  rules.push("GEOIP,CN,DIRECT");
  if (!rules.some(r => r.startsWith("FINAL,"))) rules.push("FINAL,US");
  const finalRules = [...new Set(rules)];

  const config = {
    port: 7890,
    "socks-port": 7891,
    "mixed-port": 7890,
    "allow-lan": true,
    mode: "rule",
    "log-level": "info",
    dns: buildDNS(),
    proxies,
    "proxy-groups": groups,
    rules: finalRules
  };

  const meta = { proxies: proxies.length, groups: groups.length, rules: finalRules.length, hash: sha256(JSON.stringify(config)) };
  return { config, meta };
}

function main() {
  const { config, meta } = build();
  const header = `# ✦ Neon Stash Config ✦
# Generated: ${new Date().toISOString()}
# Commit: ${gitCommit()}
# Generator: gen-stash.js v${VERSION}
# Proxies: ${meta.proxies}, Groups: ${meta.groups}, Rules: ${meta.rules}
# SHA256: ${meta.hash}
# ────────────────────────────────────────────────
`;
  const outContent = header + JSON.stringify(config, null, 2);

  if (DRY_RUN) console.log(outContent);
  else {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, outContent);
    console.log(`⚡ stash.yaml → ${OUTPUT} (${meta.hash.slice(0,12)})`);
  }

  if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify(meta));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-stash.js")) main();
