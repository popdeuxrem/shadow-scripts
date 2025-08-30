#!/usr/bin/env node
/**
 * gen-stash.js
 * -----------------------------------------------------------------------------
 * Stash Configuration Generator
 *
 * Author: PopdeuxRem
 * Version: 3.0.0
 *
 * Reads configs/master-rules.yaml and generates a stash-compatible config file
 * in apps/loader/public/configs/stash.yaml
 */

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const INPUT_PATH = path.join(ROOT, "configs/master-rules.yaml");
const OUTPUT_DIR = path.join(ROOT, "apps/loader/public/configs");
const OUTPUT_FILE = path.join(OUTPUT_DIR, "stash.yaml");

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function loadYaml(file) {
  if (!fs.existsSync(file)) {
    console.error(`❌ Input YAML not found: ${file}`);
    process.exit(1);
  }
  try {
    return yaml.load(fs.readFileSync(file, "utf8")) || {};
  } catch (e) {
    console.error(`❌ Failed to parse ${file}: ${e.message}`);
    process.exit(1);
  }
}

function buildStashConfig(master) {
  const proxies = [];
  const proxyGroups = [];
  const rules = [];

  // --- Proxies ---
  for (const [region, entries] of Object.entries(master.proxies || {})) {
    for (const proxy of entries) {
      const norm = { ...proxy };

      // Normalize types for Stash
      switch (norm.type) {
        case "socks5":
        case "http":
        case "https":
        case "ss":
        case "vmess":
        case "vless":
        case "trojan":
        case "tuic":
        case "hysteria":
        case "hysteria2":
          break;
        default:
          console.warn(`⚠️ Unsupported proxy type in stash: ${norm.type}`);
          continue;
      }
      proxies.push(norm);
    }
  }

  // --- Groups ---
  for (const [name, members] of Object.entries(master.groups || {})) {
    proxyGroups.push({
      name,
      type: "select",
      proxies: members || [],
    });
  }

  // --- Rules ---
  for (const rule of master.rules || []) {
    if (typeof rule === "object" && rule.type && rule.value) {
      rules.push(`${rule.type},${rule.value},${rule.group || "DIRECT"}`);
    }
  }

  // External rules
  for (const ext of master.external_rule_sets || []) {
    if (ext.url && ext.group) {
      rules.push(`RULE-SET,${ext.url},${ext.group}`);
    }
  }

  // Block rules
  for (const d of master.block_domains || []) {
    rules.push(`DOMAIN-SUFFIX,${d},REJECT`);
  }

  // Ensure final rule
  if (!rules.some(r => r.startsWith("FINAL,"))) {
    rules.push(`FINAL,US`);
  }

  return {
    port: 7890,
    socks-port: 7891,
    allow-lan: true,
    mode: "rule",
    log-level: "info",
    dns: {
      enable: true,
      listen: "0.0.0.0:53",
      nameserver: ["1.1.1.1", "8.8.8.8"],
    },
    proxies,
    "proxy-groups": proxyGroups,
    rules,
  };
}

function main() {
  console.log("⚙️ Generating stash.yaml...");
  const master = loadYaml(INPUT_PATH);
  const stashConfig = buildStashConfig(master);

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, yaml.dump(stashConfig, { noRefs: true }));

  console.log(`✅ stash.yaml generated: ${OUTPUT_FILE}`);
  console.log(`   SHA256: ${sha256(fs.readFileSync(OUTPUT_FILE))}`);
}

if (require.main === module) {
  main();
}

module.exports = { buildStashConfig };
