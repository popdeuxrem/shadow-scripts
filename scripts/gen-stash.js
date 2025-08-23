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

function renderStash(rules) {
  let out = "proxies:\n";
  for (const p of extractProxies(rules)) {
    out += `  - name: ${p.name}\n    type: ${p.type}\n    server: ${p.host}\n    port: ${p.port}\n`;
    if (p.user) out += `    username: ${p.user}\n`;
    if (p.pass) out += `    password: ${p.pass}\n`;
    if (p.uuid) out += `    uuid: ${p.uuid}\n`;
    if (p.tls) out += `    tls: ${p.tls}\n`;
    if (p.ws) out += `    ws: ${p.ws}\n`;
    if (p.ws_path || p.wsPath) out += `    ws-path: ${p.ws_path || p.wsPath}\n`;
  }
  if (rules.groups) {
    out += "proxy-groups:\n";
    for (const [name, proxies] of Object.entries(rules.groups)) {
      out += `  - name: ${name}\n    type: select\n    proxies:\n`;
      for (const p of proxies) out += `      - ${p}\n`;
    }
  }
  if (rules.rules) {
    out += "rules:\n";
    for (const r of rules.rules) {
      if (r.type && r.value && r.group) out += `  - ${r.type},${r.value},${r.group}\n`;
    }
  }
  return out;
}

function main() {
  const inFile = process.argv[2] || path.resolve(__dirname, "../configs/master-rules.yaml");
  const outFile = "stash.conf";
  const rules = readYaml(inFile);
  const outdir = path.resolve(__dirname, "../apps/loader/public/configs");
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, outFile), renderStash(rules));
  console.log(`Wrote: ${outFile}`);
}
main();
