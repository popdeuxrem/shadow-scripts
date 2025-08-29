#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const yaml = require('js-yaml');

const LOADER_BASE = 'https://popdeuxrem.github.io/shadow-scripts/index.html';
const MANIFEST_PATH = path.resolve(__dirname, '../apps/loader/public/manifest.json');
const MASTER_RULES_PATH = path.resolve(__dirname, '../configs/master-rules.yaml');
const OUTPUT_PATH = path.resolve(__dirname, '../apps/loader/public/configs/stash.yaml');

function createProxy({ name, loaderURL }) {
  return {
    name,
    type: 'http',
    url: loaderURL,
    interval: 3600,
    method: 'GET',
    path: '/',
    headers: {
      'User-Agent': 'Quantum-Stash-Agent'
    }
  };
}

function createScriptProxy({ name, loaderURL }) {
  return {
    name: `${name}-script`,
    type: 'script',
    url: loaderURL,
    interval: 3600,
    parse: false,
    timeout: 10
  };
}

function generateLoaderURL(target, version) {
  const id = crypto.randomUUID().slice(0, 8);
  return `${LOADER_BASE}?t=${encodeURIComponent(target)}&v=${version}#${id}`;
}

function buildProxyGroup(proxies) {
  return [
    {
      name: 'All',
      type: 'select',
      proxies: proxies.map((p) => p.name)
    }
  ];
}

function transformRules(masterRules) {
  const ruleLines = [];

  if (masterRules?.rules?.length) {
    for (const rule of masterRules.rules) {
      switch (rule.type) {
        case 'DOMAIN-SUFFIX':
          ruleLines.push(`  - DOMAIN-SUFFIX,${rule.domain},All`);
          break;
        case 'DOMAIN-KEYWORD':
          ruleLines.push(`  - DOMAIN-KEYWORD,${rule.keyword},All`);
          break;
        case 'IP-CIDR':
          ruleLines.push(`  - IP-CIDR,${rule.cidr},All`);
          break;
        case 'SCRIPT':
          ruleLines.push(`  - RULE-SCRIPT,${rule.name}-script`);
          break;
        default:
          break;
      }
    }
  }

  ruleLines.push('  - MATCH,All');
  return ruleLines;
}

function buildStashYaml(manifest, masterRules) {
  const proxies = [];
  const scriptProxies = [];

  for (const target of manifest.targets) {
    const url = generateLoaderURL(target.name, manifest.version);
    proxies.push(createProxy({ name: target.name, loaderURL: url }));
    scriptProxies.push(createScriptProxy({ name: target.name, loaderURL: url }));
  }

  const proxyGroups = buildProxyGroup(proxies);
  const rules = transformRules(masterRules);

  const stash = {
    proxies: [...proxies, ...scriptProxies],
    'proxy-groups': proxyGroups,
    rules
  };

  return yaml.dump(stash, { noRefs: true, lineWidth: 120 });
}

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`❌ manifest.json missing: ${MANIFEST_PATH}`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8'));
  const masterRules = fs.existsSync(MASTER_RULES_PATH)
    ? yaml.load(fs.readFileSync(MASTER_RULES_PATH, 'utf-8'))
    : null;

  const output = buildStashYaml(manifest, masterRules);

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, output, 'utf-8');

  console.log(`✅ stash.yaml written to ${OUTPUT_PATH}`);
}

main();
