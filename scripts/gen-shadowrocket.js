#!/usr/bin/env node
/**
 * scripts/gen-shadowrocket.js v3.0.0
 * ───────────────────────────────────────────────
 * Hardened Shadowrocket Config Generator
 *
 * Features:
 *  - Cyberpunk neon metadata header (git SHA, timestamp, version)
 *  - Flexible DNS: Cloudflare/DoH/DoT/system overrides
 *  - MITM hostname filtering with safe vs sensitive classification
 *  - CI/CD JSON summary
 *  - Safe defaults if proxies, rules, or hosts are missing
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import yaml from "js-yaml";
import { execSync } from "child_process";

const VERSION = "3.0.0";
const INPUT = process.env.MASTER_RULES || path.join("configs", "master-rules.yaml");
const OUTPUT = process.env.SHADOWROCKET_OUT || path.join("apps", "loader/public/configs", "shadowrocket.conf");
const FINAL_GROUP = process.env.FINAL_GROUP || "US";
const STRICT_DNS = process.env.STRICT_DNS === "true";
const DNS_OVERRIDE = process.env.DNS_OVERRIDE || null;
const ALLOW_SENSITIVE = process.env.ALLOW_SENSITIVE === "true";
const CI_MODE = process.argv.includes("--ci");

const HARDENED_DNS = [
  "1.1.1.1",
  "1.0.0.1",
  "9.9.9.9",
  "149.112.112.112",
  "45.90.28.0",
  "45.90.30.0",
];

function gitCommit() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

function loadYAML(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    return yaml.load(raw) || {};
  } catch (e) {
    console.error(`⚠️ Failed to load ${file}: ${e.message}`);
    return {};
  }
}

const doc = loadYAML(INPUT);

function build() {
  const lines = [];
  const git = gitCommit();

  // Metadata header
  lines.push(`# ───────────────────────────────────────────`);
  lines.push(`# ✦ Shadowrocket Config Cyberpunk v${VERSION} ✦`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Commit: ${git}`);
  lines.push(`# ───────────────────────────────────────────\n`);

  // [General]
  lines.push("[General]");
  let dnsList = HARDENED_DNS;
  if (!STRICT_DNS && Array.isArray(doc.general?.dns)) dnsList = doc.general.dns;
  if (DNS_OVERRIDE) dnsList = [DNS_OVERRIDE];
  lines.push(`dns-server = ${dnsList.join(", ")}`);
  lines.push("udp-relay = true");
  lines.push("ipv6 = true");
  lines.push("skip-proxy = 192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.0/8,localhost,*.local");
  lines.push("dns-fallback-system = false\n");

  // [Proxy]
  lines.push("[Proxy]");
  let proxyCount = 0;
  if (doc.proxies) {
    Object.entries(doc.proxies).forEach(([region, arr]) => {
      (arr || []).forEach(p => {
        proxyCount++;
        const parts = [
          `${p.name || `${region}-proxy${proxyCount}`} = ${p.type || "socks5"}`,
          `server = ${p.host || "127.0.0.1"}`,
          `server_port = ${p.port || 1080}`,
        ];
        if (p.user) parts.push(`username = ${p.user}`);
        if (p.pass) parts.push(`password = ${p.pass}`);
        if (p.tls) parts.push("tls = true");
        if (p.sni) parts.push(`sni = ${p.sni}`);
        lines.push(parts.join(", "));
      });
    });
  }
  if (proxyCount === 0) lines.push("DIRECT = direct\n");

  // [Policy]
  lines.push("[Policy]");
  const groups = doc.groups || [];
  if (groups.length === 0) {
    lines.push(`US = select, DIRECT\n`);
  } else {
    groups.forEach(g => {
      const members = Array.isArray(g.proxies || g.list) ? g.proxies || g.list : [];
      const unique = [...new Set(members.filter(Boolean).map(m => String(m).trim()))];
      lines.push(`${g.name} = select, ${unique.length ? unique.join(", ") : "DIRECT"}`);
    });
    lines.push("");
  }

  // [Rule]
  lines.push("[Rule]");
  const rules = doc.rules || [];
  rules.forEach(r => {
    if (typeof r === "string") lines.push(r);
    else if (r.type && r.value) {
      if (r.type.toUpperCase() === "MATCH") lines.push(`FINAL,${r.group || FINAL_GROUP}`);
      else lines.push(`${r.type.toUpperCase()},${r.value},${r.group || FINAL_GROUP}`);
    }
  });
  (doc.block_domains || []).forEach(d => lines.push(`DOMAIN-SUFFIX,${d},REJECT`));
  if (!lines.some(l => l.startsWith("FINAL,"))) lines.push(`FINAL,${FINAL_GROUP}\n`);

  // [MITM]
  const mitmHosts = (doc.mitm_hostnames || []).filter(Boolean);
  const sensitive = mitmHosts.filter(h => /(paypal|apple|google|login|bank|stripe|icloud)/i.test(h));
  const finalMitm = ALLOW_SENSITIVE ? mitmHosts : mitmHosts.filter(h => !sensitive.includes(h));
  if (finalMitm.length) {
    lines.push("[MITM]");
    lines.push("enable = true");
    lines.push(`hostname = ${finalMitm.join(", ")}`);
    const caId = crypto.createHash("sha1").update(finalMitm.join(",")).digest("hex").slice(0, 12);
    lines.push(`# CA Fingerprint: ${caId}\n`);

    // MITM report
    const mitmReport = { total: mitmHosts.length, included: finalMitm, filtered_sensitive: sensitive };
    fs.writeFileSync(path.join(path.dirname(OUTPUT), "mitm-report.json"), JSON.stringify(mitmReport, null, 2));
  }

  return { content: lines.join("\n"), stats: { proxyCount, groupCount: groups.length, ruleCount: rules.length, mitmCount: finalMitm.length } };
}

function main() {
  const { content, stats } = build();
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, content, "utf8");
  console.log(`✅ Shadowrocket config generated → ${OUTPUT}`);
  if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify({ ok: true, ...stats }));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-shadowrocket.js")) main();
