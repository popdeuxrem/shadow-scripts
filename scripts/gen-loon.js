#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

function readYaml(filepath) {
  return yaml.load(fs.readFileSync(filepath, "utf8"));
}
function extractProxies(rules) {
  if (!rules.proxies) return [];
  if (Array.isArray(rules.proxies)) return rules.proxies;
  return Object.values(rules.proxies).flat();
}
function renderLoon(rules) {
  let out = "[Proxy]\n";
  for (const p of extractProxies(rules)) {
    if (p.type === "socks5" || p.type === "http") {
      out += `${p.name} = ${p.type},${p.host},${p.port},${p.user || ""},${p.pass || ""}\n`;
    } else if (p.type === "vless") {
      out += `${p.name} = custom,${p.host},${p.port},username=${p.uuid},tls=${p.tls},ws=${p.ws},ws-path=${p.ws_path || p.wsPath || ""}\n`;
    } else {
      out += `${p.name} = ${p.type},${p.host},${p.port}\n`;
    }
  }
  if (rules.groups) {
    out += "\n[Proxy Group]\n";
    for (const [name, proxies] of Object.entries(rules.groups)) {
      out += `${name} = select, ${proxies.join(", ")}\n`;
    }
  }
  if (rules.rules) {
    out += "\n[Rule]\n";
    for (const r of rules.rules) {
      if (r.type && r.value && r.group) out += `${r.type},${r.value},${r.group}\n`;
    }
  }
  return out;
}
function main() {
  const inFile = process.argv[2] || path.resolve(__dirname, "../configs/master-rules.yaml");
  const outFile = "loon.conf";
  const rules = readYaml(inFile);
  const outdir = path.resolve(__dirname, "../apps/loader/public/configs");
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, outFile), renderLoon(rules));
  console.log(`Wrote: ${outFile}`);
}
main();
