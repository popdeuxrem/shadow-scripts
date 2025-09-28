#!/usr/bin/env node
/**
 * scripts/gen-shadowrocket.js v3.1.0
 * Hardened Shadowrocket Config Generator (patched)
 *
 * - Dynamic import of js-yaml (safe in CI)
 * - Accepts --outdir=<path> CLI override
 * - Guarantees non-empty output even on partial failures
 * - Emits CI-SUMMARY-JSON for CI parsing
 */

import fs from "fs";
import path from "path";
import crypto from "crypto";
import { execSync } from "child_process";

const VERSION = "3.1.0";

const argv = process.argv.slice(2);
const CI_MODE = argv.includes("--ci");
const OUTDIR_ARG = argv.find(a => a.startsWith("--outdir="));
const OUTPUT = process.env.SHADOWROCKET_OUT || (OUTDIR_ARG ? path.join(OUTDIR_ARG.split("=")[1], "shadowrocket.conf") : path.join("apps", "loader/public/configs", "shadowrocket.conf"));
const INPUT = process.env.MASTER_RULES || path.join("configs", "master-rules.yaml");
const FINAL_GROUP = process.env.FINAL_GROUP || "US";
const STRICT_DNS = process.env.STRICT_DNS === "true";
const DNS_OVERRIDE = process.env.DNS_OVERRIDE || null;
const ALLOW_SENSITIVE = process.env.ALLOW_SENSITIVE === "true";

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

async function loadYAML(file) {
  // dynamic import to avoid hard failure if js-yaml not installed
  try {
    if (!fs.existsSync(file)) {
      console.warn(`[WARN] YAML input not found: ${file}`);
      return {};
    }
    const raw = fs.readFileSync(file, "utf8");
    try {
      const yamlPkg = await import("js-yaml");
      // note: import returns namespace; loader default available as .default in some bundlers
      const yaml = yamlPkg?.load ? yamlPkg : yamlPkg.default;
      return yaml.load(raw) || {};
    } catch (e) {
      console.warn(`[WARN] js-yaml dynamic import failed (${e.message}); proceeding with empty ruleset`);
      return {};
    }
  } catch (e) {
    console.warn(`[WARN] Failed to read YAML ${file}: ${e.message}`);
    return {};
  }
}

function normalizeProxyName(name, idx) {
  // ensure no whitespace and a predictable name
  return String(name || `proxy${idx}`).replace(/\s+/g, "_");
}

function safeWriteOutput(filePath, content) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, "utf8");
    const size = fs.statSync(filePath).size;
    if (size === 0) throw new Error("file written but size is 0");
    console.log(`✅ Shadowrocket config generated → ${filePath} (${size} bytes)`);
    return true;
  } catch (e) {
    console.error(`[ERROR] Failed to write Shadowrocket config: ${e.message}`);
    return false;
  }
}

function buildFromDoc(doc) {
  const lines = [];
  const git = gitCommit();

  // Metadata header
  lines.push(`# ───────────────────────────────────────────`);
  lines.push(`# ✦ Shadowrocket Config v${VERSION} ✦`);
  lines.push(`# Generated: ${new Date().toISOString()}`);
  lines.push(`# Commit: ${git}`);
  lines.push(`# ───────────────────────────────────────────\n`);

  // [General]
  lines.push("[General]");
  let dnsList = HARDENED_DNS;
  if (!STRICT_DNS && Array.isArray(doc.general?.dns) && doc.general.dns.length) dnsList = doc.general.dns;
  if (DNS_OVERRIDE) dnsList = [DNS_OVERRIDE];
  lines.push(`dns-server = ${dnsList.join(", ")}`);
  lines.push("udp-relay = true");
  lines.push("ipv6 = true");
  lines.push("skip-proxy = 192.168.0.0/16,10.0.0.0/8,172.16.0.0/12,127.0.0.0/8,localhost,*.local");
  lines.push("dns-fallback-system = false\n");

  // [Proxy]
  lines.push("[Proxy]");
  let proxyCount = 0;
  if (doc.proxies && typeof doc.proxies === "object") {
    Object.entries(doc.proxies).forEach(([region, arr]) => {
      (arr || []).forEach((p, i) => {
        proxyCount++;
        const parts = [];
        const name = normalizeProxyName(p?.name || `${region}-p${i+1}`, proxyCount);
        parts.push(`${name} = ${p?.type || "socks5"}`);
        parts.push(`server = ${p?.host || "127.0.0.1"}`);
        parts.push(`server_port = ${p?.port || 1080}`);
        if (p?.user) parts.push(`username = ${p.user}`);
        if (p?.pass) parts.push(`password = ${p.pass}`);
        if (p?.tls) parts.push("tls = true");
        if (p?.sni) parts.push(`sni = ${p.sni}`);
        lines.push(parts.join(", "));
      });
    });
  }
  if (proxyCount === 0) lines.push("DIRECT = direct\n");

  // [Policy]
  lines.push("[Policy]");
  const groups = Array.isArray(doc.groups) ? doc.groups : [];
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
  const rules = Array.isArray(doc.rules) ? doc.rules : [];
  rules.forEach(r => {
    if (typeof r === "string") lines.push(r);
    else if (r && r.type && r.value) {
      if (r.type.toUpperCase() === "MATCH") lines.push(`FINAL,${r.group || FINAL_GROUP}`);
      else lines.push(`${r.type.toUpperCase()},${r.value},${r.group || FINAL_GROUP}`);
    }
  });

  (Array.isArray(doc.block_domains) ? doc.block_domains : []).forEach(d => lines.push(`DOMAIN-SUFFIX,${d},REJECT`));
  if (!lines.some(l => l.startsWith("FINAL,"))) lines.push(`FINAL,${FINAL_GROUP}\n`);

  // [MITM]
  const mitmHosts = Array.isArray(doc.mitm_hostnames) ? doc.mitm_hostnames.filter(Boolean) : [];
  const sensitive = mitmHosts.filter(h => /(paypal|apple|google|login|bank|stripe|icloud)/i.test(h));
  const finalMitm = ALLOW_SENSITIVE ? mitmHosts : mitmHosts.filter(h => !sensitive.includes(h));
  if (finalMitm.length) {
    lines.push("[MITM]");
    lines.push("enable = true");
    lines.push(`hostname = ${finalMitm.join(", ")}`);
    const caId = crypto.createHash("sha1").update(finalMitm.join(",")).digest("hex").slice(0, 12);
    lines.push(`# CA Fingerprint: ${caId}\n`);

    const mitmReport = { total: mitmHosts.length, included: finalMitm, filtered_sensitive: sensitive };
    try {
      fs.writeFileSync(path.join(path.dirname(OUTPUT), "mitm-report.json"), JSON.stringify(mitmReport, null, 2));
    } catch (e) {
      console.warn(`[WARN] Could not write mitm-report.json: ${e.message}`);
    }
  }

  return {
    content: lines.join("\n"),
    stats: { proxyCount, groupCount: groups.length, ruleCount: rules.length, mitmCount: finalMitm.length }
  };
}

async function main() {
  let doc = {};
  try {
    doc = await loadYAML(INPUT);
  } catch (e) {
    console.warn(`[WARN] loadYAML failed: ${e?.message || e}`);
    doc = {};
  }

  const { content, stats } = buildFromDoc(doc);

  // ensure output dir exists and write a fallback if something goes wrong
  const ok = safeWriteOutput(OUTPUT, content);
  if (!ok) {
    // fallback minimal config (non-empty)
    const fallback = [
      "# Minimal Shadowrocket fallback",
      "[General]",
      "dns-server = 1.1.1.1",
      "",
      "[Proxy]",
      "DIRECT = direct",
      "",
      "[Rule]",
      `FINAL,${FINAL_GROUP}`,
    ].join("\n");
    const fallbackOk = safeWriteOutput(OUTPUT, fallback);
    if (!fallbackOk) {
      if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify({ ok: false, error: "write_failed" }));
      process.exit(1);
    }
    // still emit summary with limited stats
    if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify({ ok: true, fallback: true, stats }));
    process.exit(0);
  }

  // success
  if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify({ ok: true, ...stats }));
  process.exit(0);
}

// run if invoked directly
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-shadowrocket.js")) {
  main().catch(err => {
    console.error(`[ERROR] gen-shadowrocket failed: ${err.message}`);
    if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  });
}