#!/usr/bin/env node
/**
 * build-shadowrocket.js: Generates a Shadowrocket configuration file.
 *
 * This script reads a master YAML configuration file and produces a .conf file
 * compatible with Shadowrocket, including proxy, group, and rule definitions.
 * It is designed to be robust, handling missing data gracefully.
 *
 * @author PopdeuxRem
 * @version 2.0.0
 * @last-modified 2025-08-27
 *
 * @input {string} [process.env.MASTER_RULES] - Path to the master YAML file.
 * @input {string} [process.env.DNS_SERVER] - DNS server IP address (default: 1.1.1.1).
 * @input {string} [process.env.SHADOW_GROUP_NAME] - Default proxy group name (default: Proxy).
 * @output {string} apps/loader/public/configs/shadowrocket.conf
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

// --- Configuration & Constants ---
const ROOT_DIR = path.resolve(__dirname, '..');
const INPUT_YAML_PATH = process.env.MASTER_RULES || path.join(ROOT_DIR, 'configs/master-rules.yaml');
const OUTPUT_DIR = path.join(ROOT_DIR, 'apps/loader/public/configs');
const OUTPUT_CONF_PATH = path.join(OUTPUT_DIR, 'shadowrocket.conf');

// Environment variable fallbacks
const DNS_SERVER = process.env.DNS_SERVER || '1.1.1.1';
const DEFAULT_GROUP = process.env.SHADOW_GROUP_NAME || 'Proxy';

// --- Helper Functions ---

/**
 * Reads and parses a YAML file with robust error handling.
 * @param {string} filePath - The path to the YAML file.
 * @returns {object} The parsed YAML document.
 */
const readYamlFile = (filePath) => {
  try {
    return yaml.load(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`❌ Error: Master rules file not found at '${filePath}'`);
    } else {
      console.error(`❌ Error: Failed to parse YAML file '${filePath}'. Please check for syntax errors.`);
    }
    process.exit(1); // Exit with failure code
  }
};

/**
 * Joins an array of strings with a comma, filtering out falsy values.
 * @param {Array<string|null|undefined>} arr - The array to join.
 * @returns {string} The joined string.
 */
const join = (arr) => arr.filter(Boolean).join(', ');

/**
 * Formats a proxy object into a Shadowrocket proxy definition line.
 * @param {object} p - The proxy object from the YAML file.
 * @returns {string} The formatted proxy line.
 */
function formatProxy(p) {
  const common = [p.type, p.host, p.port, p.user, p.pass];
  const flags = [
    p.tls ? 'tls=true' : null,
    p['fast_open'] === false ? 'fast-open=false' : null, // Respects explicit false
    p.ws ? 'ws=true' : null,
    p.ws && p.ws_path ? `ws-path=${p.ws_path}` : null,
    p.servername ? `tls-host=${p.servername}` : null,
  ];
  return `${p.name} = ${join([...common, ...flags])}`;
}

/**
 * Converts a rule object to a valid Shadowrocket rule line.
 * @param {object} r - The rule object from the YAML file.
 * @returns {string|null} The formatted rule line or null if the type is invalid.
 */
function formatRule(r) {
  const type = r.type?.toUpperCase();
  const value = r.value;
  const group = r.group || DEFAULT_GROUP;
  
  // Use a Set for efficient validation of supported rule types.
  const VALID_RULE_TYPES = new Set([
    'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'GEOIP', 'IP-CIDR', 
    'SRC-IP-CIDR', 'URL-REGEX', 'DST-PORT'
  ]);

  return VALID_RULE_TYPES.has(type) ? `${type},${value},${group}` : null;
}

// --- Main Execution ---

try {
  const doc = readYamlFile(INPUT_YAML_PATH);

  // Section: [General]
  const generalSection = [
    '[General]',
    `dns-server = ${DNS_SERVER}`,
    'ipv6 = false',
    'udp-relay = true',
    'bypass-system = true',
    'skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local',
  ];

  // Section: [Proxy] - Safely handles missing `proxies` section
  const proxies = Object.values(doc.proxies ?? {}).flat().map(formatProxy);
  const proxySection = ['[Proxy]', ...proxies];

  // Section: [Proxy Group] - Safely handles missing `groups` section
  const groups = Object.entries(doc.groups ?? {}).map(([name, list]) => 
    `${name} = select, ${join([...list, 'DIRECT'])}`
  );
  const groupSection = ['[Proxy Group]', ...groups];

  // Section: [Rule] - Safely handles missing rule sections
  const rules = (doc.rules ?? []).map(formatRule).filter(Boolean);
  const ruleSets = (doc.external_rule_sets ?? []).map(e => `RULE-SET,${e.url},${e.group}`);
  const blockRules = (doc.block_domains ?? []).map(d => `DOMAIN-SUFFIX,${d},REJECT`);
  const ruleSection = ['[Rule]', ...rules, ...ruleSets, ...blockRules, `FINAL,${DEFAULT_GROUP}`];

  // Section: [Script] - Safely handles missing `scripts.loader_url`
  const scriptSection = doc.scripts?.loader_url
    ? ['[Script]', `MITM-LOADER = type=http-response,pattern=https?:\\/\\/.+,script-path=${doc.scripts.loader_url}`]
    : [];

  // Section: [MITM] - Safely handles missing `mitm_hostnames`
  const mitmSection = doc.mitm_hostnames?.length
    ? ['[MITM]', 'enable = true', `hostname = ${doc.mitm_hostnames.join(',')}`]
    : [];

  // Assemble the final configuration file content
  const finalConf = [
    generalSection,
    proxySection,
    groupSection,
    ruleSection,
    scriptSection,
    mitmSection,
  ]
  .map(section => section.join('\n')) // Join lines within each section
  .filter(section => section.trim())  // Filter out empty or whitespace-only sections
  .join('\n\n');                      // Join sections with a blank line for readability

  // Write the output file
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  fs.writeFileSync(OUTPUT_CONF_PATH, finalConf + '\n'); // Ensure final newline
  
  console.log('✓ shadowrocket.conf →', path.relative(ROOT_DIR, OUTPUT_CONF_PATH));

} catch (error) {
  console.error('An unexpected error occurred during the build process:', error);
  process.exit(1);
}
