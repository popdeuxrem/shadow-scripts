// scripts/gen-shadowrocket.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// ===== Settings =====
const OUTPUT = path.resolve(__dirname, '../apps/loader/public/configs/shadowrocket.conf');
const RULES_FILE = path.resolve(__dirname, '../configs/master-rules.yaml');
const DNS_SERVER = process.env.DNS_SERVER || '1.1.1.1';

function parseRules() {
  if (!fs.existsSync(RULES_FILE)) {
    throw new Error(`Rules file not found: ${RULES_FILE}`);
  }
  return yaml.load(fs.readFileSync(RULES_FILE, 'utf8'));
}

function renderShadowrocket(rules, dns) {
  let out = [];

  out.push(`[General]`);
  out.push(`dns-server = ${dns}`);

  // Proxies
  if (rules?.proxies && Array.isArray(rules.proxies)) {
    out.push(`\n[Proxy]`);
    for (const p of rules.proxies) {
      // e.g. "ProxyName = type,server,port,username,password"
      out.push(`${p.name} = ${p.type},${p.server},${p.port}${p.username ? ',' + p.username : ''}${p.password ? ',' + p.password : ''}`);
    }
  }

  // Proxy Groups
  if (rules?.proxy_groups && Array.isArray(rules.proxy_groups)) {
    out.push(`\n[Proxy Group]`);
    for (const g of rules.proxy_groups) {
      // e.g. "GroupName = select, Proxy1, Proxy2"
      out.push(`${g.name} = ${g.type}, ${g.proxies?.join(', ')}`);
    }
  }

  // Rules
  if (rules?.rules && Array.isArray(rules.rules)) {
    out.push(`\n[Rule]`);
    for (const r of rules.rules) {
      out.push(r);
    }
  }

  return out.join('\n') + '\n';
}

function main() {
  const rules = parseRules();
  const conf = renderShadowrocket(rules, DNS_SERVER);
  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, conf);
  console.log(`Wrote: ${OUTPUT}`);
}

if (require.main === module) {
  main();
}
