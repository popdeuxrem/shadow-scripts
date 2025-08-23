#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// Helper: flatten proxies (region/object/array → array)
function extractProxies(rules) {
  if (!rules.proxies) return [];
  if (Array.isArray(rules.proxies)) return rules.proxies;
  // If proxies is an object: { us: [ {..}, ... ], eu: [...] }
  return Object.values(rules.proxies).flat();
}

// Helper: join group names for a Proxy Group
function getGroupNames(groups) {
  if (!groups) return [];
  return Object.keys(groups);
}

// Helper: Proxy definitions
function renderProxy(p) {
  if (p.type === "socks5") {
    return `${p.name} = socks5,${p.host},${p.port},username=${p.user || ""},password=${p.pass || ""}`;
  } else if (p.type === "http") {
    return `${p.name} = http,${p.host},${p.port},username=${p.user || ""},password=${p.pass || ""}`;
  } else if (p.type === "vless") {
    // VLESS via custom for Shadowrocket
    return (
      `${p.name} = custom,${p.host},${p.port},username=${p.user || p.uuid},` +
      `tls=${p.tls},ws=${p.ws},ws-path=${p.ws_path || p.wsPath || ""}` +
      (p.servername ? `,servername=${p.servername}` : "")
    );
  } else {
    return `${p.name} = ${p.type},${p.host},${p.port}`;
  }
}

// Proxy Groups
function renderProxyGroups(groups) {
  if (!groups) return "";
  let out = "[Proxy Group]\n";
  for (const [name, proxies] of Object.entries(groups)) {
    out += `${name} = select, ${proxies.join(", ")}\n`;
  }
  return out;
}

// Rules (DOMAIN-SUFFIX, DOMAIN, etc)
function renderRules(rules) {
  if (!rules) return "";
  let out = "[Rule]\n";
  for (const r of rules) {
    if (r.type && r.value && r.group) {
      out += `${r.type},${r.value},${r.group}\n`;
    }
  }
  return out;
}

// MITM
function renderMitm(mitm) {
  if (!mitm) return "";
  return `[MITM]\nhostname = ${mitm.join(", ")}\n`;
}

// Script loader
function renderScripts(scripts) {
  if (!scripts || !scripts.loader_url) return "";
  return `[Script]\n# Loader\n${scripts.loader_url}, tag=injector, enabled=true\n`;
}

// Block domains as [Host] or [Rule]
function renderBlockDomains(domains) {
  if (!domains || !domains.length) return "";
  let out = "# Blocked domains\n";
  for (const d of domains) {
    out += `DOMAIN-SUFFIX,${d},REJECT\n`;
  }
  return out;
}

// External rule-sets
function renderExternalRuleSets(ruleSets) {
  if (!ruleSets) return "";
  let out = "# External RULE-SETs\n";
  for (const rs of ruleSets) {
    if (rs.url && rs.group) {
      out += `RULE-SET,${rs.url},${rs.group}\n`;
    }
  }
  return out;
}

// Entrypoint
function main() {
  const inFile = process.argv[2] || path.resolve(__dirname, "../configs/master-rules.yaml");
  const outFile = "shadowrocket.conf";
  const raw = fs.readFileSync(inFile, "utf8");
  const rules = yaml.load(raw);

  let out = "";

  // [Proxy]
  const allProxies = extractProxies(rules);
  out += "[Proxy]\n";
  for (const p of allProxies) out += renderProxy(p) + "\n";

  // [Proxy Group]
  out += "\n" + renderProxyGroups(rules.groups);

  // [Rule]
  out += "\n" + renderRules(rules.rules);

  // Block domains
  out += "\n" + renderBlockDomains(rules.block_domains);

  // External rule sets
  out += "\n" + renderExternalRuleSets(rules.external_rule_sets);

  // MITM
  out += "\n" + renderMitm(rules.mitm_hostnames);

  // Script loader
  out += "\n" + renderScripts(rules.scripts);

  // Output
  const outdir = path.resolve(__dirname, "../apps/loader/public/configs");
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, outFile), out);
  console.log(`Wrote: ${outFile}`);
}

main();
