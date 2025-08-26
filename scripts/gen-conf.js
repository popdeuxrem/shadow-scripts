// scripts/gen-conf.js
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const manifestPath = path.resolve(__dirname, '../apps/loader/public/manifest.json');
const rulesYamlPath = path.resolve(__dirname, '../configs/master-rules.yaml');
const outConfPath = path.resolve(__dirname, '../configs/shadowrocket.conf');

function loadYAML(file) {
  try {
    return yaml.load(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    console.error('YAML load error:', err);
    process.exit(1);
  }
}

function loadManifest() {
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  } catch (err) {
    console.error('Manifest load error:', err);
    process.exit(1);
  }
}

function buildProxySections(proxies, groups) {
  const lines = [];
  for (const [key, proxy] of Object.entries(proxies)) {
    const { type, host, port, user, pass, tls, ws, ws_path } = proxy;
    let line = `${key} = ${type}, ${host}, ${port}, ${user || ''}, ${pass || ''}`;
    if (tls) line += ', tls=true';
    if (ws) line += `, ws=true, ws-path=${ws_path}`;
    lines.push(line);
  }
  const groupLines = Object.entries(groups).map(([grp, arr]) =>
    `${grp} = select, ${arr.join(', ')}`
  );
  return lines.concat(groupLines);
}

function buildRules(rulesArr) {
  return rulesArr.map(r =>
    `DOMAIN-${r.type},${r.value},${r.group}`
  ).join('\n');
}

function buildExternalSets(arr) {
  return arr.map(set =>
    `RULE-SET,${set.url},${set.group}`
  ).join('\n');
}

function buildScripts(manifestEntries) {
  return manifestEntries
    .map(e => `hostname = ${e.hostname}, script-response-body https://popdeuxrem.github.io/shadow-scripts/obfuscated/${e.file}?${e.buildTag} tag=${e.file}`)
    .join('\n');
}

function buildMitm(mitmHosts) {
  return `hostname = ${mitmHosts.join(', ')}`;
}

function main() {
  const yamlConf = loadYAML(rulesYamlPath);
  const manifest = loadManifest();

  const proxies = yamlConf.proxies.us || {};
  const groups = yamlConf.groups || {};

  const lines = [
    '[General]',
    'dns-server = 1.1.1.1',
    'ipv6 = false',
    '',
    '[Proxy]',
    ...buildProxySections(proxies, groups),
    '',
    '[Proxy Group]',
    groups.US ? `US = url-test, ${groups.US.join(', ')}` : '',
    '',
    '[Rule]',
    buildRules(yamlConf.rules),
    '',
    buildScripts(manifest),
    '',
    '[MITM]',
    buildMitm(yamlConf.mitm_hostnames),
    '',
    buildExternalSets(yamlConf.external_rule_sets),
    '',
    '# Block domains:',
    ...(yamlConf.scripts.block_domains.map(d => `DOMAIN-SUFFIX,${d},REJECT`))
  ];

  fs.writeFileSync(outConfPath, lines.filter(Boolean).join('\n'));
  console.log('✅ shadowrocket.conf generated at:', outConfPath);
}

main()
