#!/usr/bin/env node
/**
 * scripts/gen-loon.js v3.0.0
 * ───────────────────────────────────────────────
 * Cyberpunk Futuristic Loon Config Generator
 *
 * Features:
 *  - Hardened Cloudflare DNS defaults
 *  - MITM host filtering (safe vs sensitive)
 *  - Annotated, minified, JSON, diff, prepend/append
 *  - CI/CD friendly summary + MITM report
 *  - ES module syntax for Node 18+
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import crypto from "crypto";
import { execSync } from "child_process";
import { v4 as uuidv4 } from "uuid";

const VERSION = "3.0.0";
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

const cliOutDir = getFlagValue("--outdir");
const legacyEnvOutDir = process.env.LOOON_OUTDIR;
const resolvedEnvOutDir = process.env.LOON_OUTDIR || legacyEnvOutDir;
if (legacyEnvOutDir && !process.env.LOON_OUTDIR) {
  console.warn("[WARN] Detected LOOON_OUTDIR (deprecated). Use LOON_OUTDIR instead.");
}
if (cliOutDir && process.env.LOON_OUTDIR) {
  console.warn("[WARN] Both CLI --outdir and LOON_OUTDIR provided; CLI flag takes precedence.");
}
const resolvedOutDir = cliOutDir || resolvedEnvOutDir;
const OUT_DIR = resolvedOutDir
  ? (path.isAbsolute(resolvedOutDir) ? resolvedOutDir : path.resolve(process.cwd(), resolvedOutDir))
  : path.join("apps/loader/public/configs");
const OUT_FILE = path.join(OUT_DIR, "loon.conf");

const MINIFY = process.argv.includes("--minify");
const ANNOTATE = process.argv.includes("--annotate");
const ALLOW_SENSITIVE = process.argv.includes("--allow-sensitive");
const CI_MODE = process.argv.includes("--ci");
const DRY_RUN = process.argv.includes("--dry-run");

const CLOUDFLARE_DNS = [
  "1.1.1.1",
  "1.0.0.1",
  "2606:4700:4700::1111",
  "2606:4700:4700::1001",
];

function gitCommit() {
  try {
    return execSync("git rev-parse --short HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

function sha256(str) {
  return crypto.createHash("sha256").update(str).digest("hex");
}

function loadYAML(fp) {
  try {
    const raw = fs.readFileSync(fp, "utf8");
    return yaml.load(raw) || {};
  } catch {
    return {};
  }
}

function deterministicCA(hosts) {
  return crypto.createHash("sha256").update(hosts.sort().join(",")).digest("hex").slice(0, 20).toUpperCase();
}

function build() {
  const doc = loadYAML(INPUT);
  const out = [];

  // Neon header
  out.push(`# ───────────────────────────────────────────`);
  out.push(`# ✦ Cyberpunk Loon Config ✦`);
  out.push(`# Generated: ${new Date().toISOString()}`);
  out.push(`# Commit: ${gitCommit()}`);
  out.push(`# Generator: gen-loon.js v${VERSION}`);
  out.push(`# ───────────────────────────────────────────\n`);

  // [General]
  out.push("[General]");
  out.push(`dns-server = ${CLOUDFLARE_DNS.join(", ")}`);
  out.push("");

  // [Proxy]
  out.push("[Proxy]");
  const proxies = [];
  Object.values(doc.proxies || {}).forEach(arr => (arr || []).forEach(p => proxies.push(p)));
  proxies.forEach(p => {
    const parts = [p.type || "socks5", p.host, p.port];
    const opts = [];
    if (p.user) opts.push(`username=${p.user}`);
    if (p.pass) opts.push(`password=${p.pass}`);
    out.push(`${p.name} = ${parts.join(", ")}, ${opts.join(", ")}`);
  });
  if (proxies.length === 0) out.push("DIRECT = direct");
  out.push("");

  // [Rule]
  out.push("[Rule]");
  (doc.rules || []).forEach(r => {
    if (typeof r === "string") out.push(r);
    else if (r.type && r.value && r.group) out.push(`${r.type.toUpperCase()},${r.value},${r.group}`);
  });
  (doc.block_domains || []).forEach(d => out.push(`DOMAIN-SUFFIX,${d},REJECT`));
  if (!out.some(l => l.startsWith("FINAL,"))) out.push("FINAL, Proxy");
  out.push("");

  // [MITM]
  const mitmHosts = Array.from(new Set(doc.mitm_hostnames || []));
  const sensitive = mitmHosts.filter(h => /(paypal|stripe|bank|icloud|google)/i.test(h));
  const filtered = ALLOW_SENSITIVE ? mitmHosts : mitmHosts.filter(h => !sensitive.includes(h));
  if (filtered.length) {
    out.push("[MITM]");
    out.push("skip-server-cert-check = true");
    out.push(`hostname = ${filtered.join(", ")}`);
    out.push(`CA = ${(deterministicCA(filtered) || uuidv4()).toUpperCase()}.cer`);

    // MITM report
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(
      path.join(OUT_DIR, "loon-mitm-report.json"),
      JSON.stringify({ total: mitmHosts.length, included: filtered, filtered_sensitive: sensitive }, null, 2)
    );
  }

  let content = out.join("\n");
  if (MINIFY) content = content.split(/\r?\n/).filter(l => l && !l.startsWith("#")).join("\n");

  const meta = {
    proxies: proxies.length,
    rules: doc.rules?.length || 0,
    mitm: filtered.length,
    dns: CLOUDFLARE_DNS,
    hash: sha256(content)
  };

  return { content, meta };
}

function main() {
  try {
    const { content, meta } = build();
    if (DRY_RUN) process.stdout.write(content);
    else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(OUT_FILE, content);
      console.log(`⚡ loon.conf → ${OUT_FILE}`);
    }
    if (CI_MODE) console.log("CI-SUMMARY-JSON:", JSON.stringify(meta));
  } catch (e) {
    console.error("✗ Generation failed:", e.message);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("gen-loon.js")) main();
