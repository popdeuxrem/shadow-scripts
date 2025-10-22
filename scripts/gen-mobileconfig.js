#!/usr/bin/env node
/**
 * scripts/gen-mobileconfig.js
 * ─────────────────────────────────────────────
 * Generates iOS .mobileconfig proxy profiles from:
 *   - configs/master-rules.yaml
 *   - apps/loader/public/manifest.json (optional)
 *
 * Outputs to configs/generated/*.mobileconfig
 *
 * Features:
 *  - One .mobileconfig per platform (Shadowrocket, Loon, Stash, Egern)
 *  - Embeds proxy definitions from master-rules.yaml
 *  - Adds build metadata + git provenance
 *  - Supports --ci for summary JSON
 *
 * Usage:
 *   node scripts/gen-mobileconfig.js
 *   node scripts/gen-mobileconfig.js --ci
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import yaml from "js-yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MASTER_RULES = path.join(ROOT, "configs", "master-rules.yaml");
const DEFAULT_MANIFEST_PATH = path.join(ROOT, "apps", "loader", "public", "manifest.json");

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

const opts = {
  ci: argv.includes("--ci"),
  outdir: getFlagValue("--outdir"),
  manifest: getFlagValue("--manifest"),
};

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

function gitMeta() {
  try {
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const date = spawnSync("git", ["show", "-s", "--format=%cI", sha], { encoding: "utf8" }).stdout.trim();
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim();
    return { sha, date, branch };
  } catch {
    return null;
  }
}

async function loadMasterRules() {
  if (!(await exists(MASTER_RULES))) {
    console.error("Missing master rules:", MASTER_RULES);
    process.exit(2);
  }
  const raw = await fs.readFile(MASTER_RULES, "utf8");
  return yaml.load(raw);
}

async function loadManifest(manifestPath) {
  if (!manifestPath) return null;
  if (!(await exists(manifestPath))) return null;
  const raw = await fs.readFile(manifestPath, "utf8");
  return JSON.parse(raw);
}

// Utility: generate UUID for PayloadIdentifier
function uuid() {
  return crypto.randomUUID();
}

function mobileConfigXML({ title, description, proxies, meta }) {
  // PayloadUUIDs must be unique per payload
  const payloadUUID = uuid();
  const payloadID = `com.shadow.scripts.${title.toLowerCase()}.${payloadUUID.slice(0,8)}`;

  // Build a proxy dictionary from the first proxy in rules
  const p = proxies[0] || {};
  const proxyDict = `
      <key>ProxyType</key><string>Manual</string>
      <key>ProxyServer</key><string>${p.host || "127.0.0.1"}</string>
      <key>ProxyServerPort</key><integer>${p.port || 1080}</integer>
      ${p.username ? `<key>ProxyUsername</key><string>${p.username}</string>` : ""}
      ${p.password ? `<key>ProxyPassword</key><string>${p.password}</string>` : ""}
  `;

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" 
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadDescription</key>
      <string>Proxy profile for ${title}</string>
      <key>PayloadDisplayName</key>
      <string>${title} Proxy</string>
      <key>PayloadIdentifier</key>
      <string>${payloadID}</string>
      <key>PayloadType</key>
      <string>com.apple.proxy.managed</string>
      <key>PayloadUUID</key>
      <string>${uuid()}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      ${proxyDict}
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>${description}</string>
  <key>PayloadDisplayName</key>
  <string>${title} Proxy Config</string>
  <key>PayloadIdentifier</key>
  <string>${payloadID}</string>
  <key>PayloadOrganization</key>
  <string>Shadow-Scripts</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${payloadUUID}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>BuildMeta</key>
  <dict>
    <key>GeneratedAt</key><string>${new Date().toISOString()}</string>
    <key>GitSHA</key><string>${meta.git?.sha || "n/a"}</string>
    <key>GitBranch</key><string>${meta.git?.branch || "n/a"}</string>
  </dict>
</dict>
</plist>`;
}

async function main() {
  const master = await loadMasterRules();
  const manifestPath = opts.manifest ? path.resolve(ROOT, opts.manifest) : DEFAULT_MANIFEST_PATH;
  const manifest = await loadManifest(manifestPath);
  const meta = { git: gitMeta() };

  const outdir = opts.outdir ? path.resolve(ROOT, opts.outdir) : path.join(ROOT, "configs", "generated");
  await fs.mkdir(outdir, { recursive: true });

  const platforms = ["Shadowrocket", "Loon", "Stash", "Egern"];
  const outputs = [];

  for (const platform of platforms) {
    const xml = mobileConfigXML({
      title: platform,
      description: `Proxy configuration for ${platform}`,
      proxies: master.proxies || [],
      meta,
    });
    const fname = `${platform.toLowerCase()}.mobileconfig`;
    const outPath = path.join(outdir, fname);
    await fs.writeFile(outPath, xml, "utf8");
    outputs.push({ platform, path: outPath });
    console.log("Generated", outPath);
  }

  if (opts.ci) {
    console.log("CI-SUMMARY-JSON:", JSON.stringify({ ok: true, outputs }));
  }
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(3);
});
