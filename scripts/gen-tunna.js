#!/usr/bin/env node
/**
 * scripts/gen-tunna.js v2.0.0
 * ───────────────────────────────────────────────
 * Cyberpunk Futuristic Tunna Config Generator
 *
 * Features:
 *  - Generates stealth-ready Tunna proxy configs
 *  - Multi-protocol support: SOCKS5, VLESS, VMess, Trojan
 *  - Proxy groups: Proxy, Auto, Fallback
 *  - Hardened DNS: Cloudflare + Google + DoH/DoT
 *  - CI/CD-friendly JSON summary + SHA256 fingerprint
 *  - ES module-ready for Node 18+
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import crypto from "crypto";
import { execSync } from "child_process";

const VERSION = "2.0.0";
const INPUT = process.env.MASTER_RULES || path.join("configs", "master-rules.yaml");

const argv = process.argv.slice(2);

function getFlagValue(flag) {
  const inline = argv.find(arg => arg.startsWith(`${flag}=`));
  if (inline) return inline.split("=")[1];
  const index = argv.indexOf(flag);
  if (index !== -1 && argv[index + 1] && !argv[index + 1].startsWith("--")) {
    return argv[index + 1];
  }
  return null;
}

const CLI_OUTDIR = getFlagValue("--outdir");
const ENV_OUTDIR = process.env.TUNNA_OUTDIR;
const ENV_OUTPUT = process.env.TUNNA_OUT;
if (CLI_OUTDIR && (ENV_OUTDIR || ENV_OUTPUT)) {
  console.warn("[WARN] CLI --outdir overrides TUNNA_OUT/TUNNA_OUTDIR environment variables.");
}
const DEFAULT_FILENAME = "tunna.yaml";
const rawOutput = (() => {
  if (CLI_OUTDIR) return path.join(CLI_OUTDIR, DEFAULT_FILENAME);
  if (ENV_OUTDIR) return path.join(ENV_OUTDIR, DEFAULT_FILENAME);
  if (ENV_OUTPUT) return ENV_OUTPUT;
  return path.join("apps/loader/public/configs", DEFAULT_FILENAME);
})();
const OUTPUT = path.isAbsolute(rawOutput) ? rawOutput : path.resolve(process.cwd(), rawOutput);

const CI_MODE = argv.includes("--ci");
const DRY_RUN = argv.includes("--dry-run");

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
  const header = `# ✦ Neon Tunna Config ✦
# Generated: ${new Date().toISOString()}
# Commit: ${gitCommit()}
# Generator: gen-tunna.js v${VERSION}
# Proxies: ${meta.proxies}, Groups: ${meta.groups}, Rules: ${meta.rules}
# SHA256: ${meta.hash}
# ────────────────────────────────────────────────
`;
  const outContent = header + JSON.stringify(config, null, 2);

  if (DRY_RUN) console.log(outContent);
  else {
    fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
    fs.writeFileSync(OUTPUT, outContent);
    console.log(`⚡ tunna.yaml → ${OUTPUT} (${meta.hash.slice(0,12)})`);
  }

  if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify(meta));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-tunna.js")) main();
