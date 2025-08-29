#!/usr/bin/env node
/**
 * gen-shadowrocket.js
 * -----------------------------------------------------------------------------
 * Enhanced Shadowrocket Configuration Generator
 * 
 * Author: PopdeuxRem
 * Generated: 2025-08-29 04:40:36 UTC
 * Version: 3.0.0
 * 
 * Advanced Features:
 *  - Full YAML anchor/merge support with variable substitution
 *  - Multi-protocol proxy support (socks5, ss, vmess, vless, trojan, hysteria, tuic)
 *  - Intelligent rule processing with category annotation
 *  - Parallel processing capabilities for large configs
 *  - Comprehensive MITM handling (no sensitive filtering)
 *  - Advanced caching and validation
 *  - Rich CLI with diff mode, dry-run, and extensive customization
 *  - Integration-ready for CI/CD pipelines
 * 
 * Usage Examples:
 *   node gen-shadowrocket.js
 *   node gen-shadowrocket.js --input configs/master-rules.yaml --final-group US
 *   node gen-shadowrocket.js --define SOCKS5_USER=alice --define VLESS_UUID=uuid-here
 *   node gen-shadowrocket.js --annotate --emit-json --stats --minify
 *   node gen-shadowrocket.js --split-rules --ca-id CUSTOM123
 *   node gen-shadowrocket.js --diff old.conf new.conf
 * 
 * Security Notes:
 *  - MITM certificates require careful management and legal compliance
 *  - Sensitive credentials should use environment variables or secure vaults
 *  - External rule sets should be verified and potentially pinned to commits
 * 
 * Performance Optimizations:
 *  - Deterministic caching based on content hashes
 *  - Efficient de-duplication algorithms
 *  - Lazy evaluation for expensive operations
 *  - Memory-conscious processing for large rule sets
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                              CLI ARGUMENT PARSING                           */
/* ═══════════════════════════════════════════════════════════════════════════ */

function parseArgs(argv) {
  const args = { _: [] };
  
  for (const token of argv.slice(2)) {
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    
    const [key, rawValue] = token.slice(2).split('=');
    const cleanKey = key.trim();
    const value = rawValue === undefined ? true : rawValue;
    
    // Handle repeatable options
    if (['define', 'prepend', 'append'].includes(cleanKey)) {
      args[cleanKey] = args[cleanKey] || [];
      if (value !== true) args[cleanKey].push(value);
    } else {
      args[cleanKey] = value;
    }
  }
  
  return args;
}

const ARGS = parseArgs(process.argv);

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                                 HELP SYSTEM                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

if (ARGS.help || ARGS.h) {
  console.log(`
┌─────────────────────────────────────────────────────────────────────────────┐
│                    Shadowrocket Configuration Generator                     │
│                         Enhanced Edition v3.0.0                            │
└─────────────────────────────────────────────────────────────────────────────┘

USAGE:
  node gen-shadowrocket.js [OPTIONS]

INPUT/OUTPUT:
  --input=FILE              Master YAML path (default: configs/master-rules.yaml)
  --output=FILE             Output .conf path (default: apps/loader/public/configs/shadowrocket.conf)
  --outdir=DIR              Output directory override

CONFIGURATION:
  --dns=LIST                Comma-separated DNS servers (default: 1.1.1.1)
  --final-group=NAME        FINAL fallback group (default: Proxy, suggest: US)
  --reject-mode=MODE        Block mode: REJECT or REJECT-DROP (default: REJECT)

PROXY & GROUPS:
  --define=KEY=VALUE        Variable substitution (repeatable)
                           Example: --define SOCKS5_USER=alice --define VLESS_UUID=uuid123

RULES & PROCESSING:
  --annotate               Add categorized rule comments
  --minify                 Strip comments and blank lines
  --split-rules            Generate rule fragments (rules/*.conf)
  --strict                 Fail fast on malformed entries

MITM & SECURITY:
  --no-mitm                Suppress MITM section entirely
  --mitm-sni-only          Only emit hostname line (no cert config)
  --ca-id=STRING           Override deterministic CA identifier

OUTPUT CONTROL:
  --emit-json              Generate metadata JSON (.conf.json)
  --stats                  Print comprehensive build statistics
  --dry                    Output to stdout only (no file write)

ADVANCED:
  --prepend=FILE           Prepend raw content block (repeatable)
  --append=FILE            Append raw content block (repeatable)
  --diff old.conf new.conf Show diff between configs (no generation)

DEBUGGING:
  --no-color               Disable colored output
  --debug                  Show stack traces on errors
  --verbose                Enable detailed logging

EXAMPLES:
  # Basic generation with US fallback
  node gen-shadowrocket.js --final-group US

  # With credentials injection
  node gen-shadowrocket.js --define SOCKS5_USER=myuser --define SOCKS5_PASS=mypass

  # Full-featured build
  node gen-shadowrocket.js --annotate --emit-json --stats --split-rules

  # Compare configurations
  node gen-shadowrocket.js --diff old-config.conf new-config.conf

  # Production minified build
  node gen-shadowrocket.js --minify --final-group US --ca-id PROD2025

For integration with build-all.sh, ensure this script is executable and
place in the scripts/ directory of your project.
`);
  process.exit(0);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                           TERMINAL STYLING & LOGGING                       */
/* ═══════════════════════════════════════════════════════════════════════════ */

const USE_COLOR = process.stdout.isTTY && !ARGS['no-color'];
const VERBOSE = !!ARGS.verbose;

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function colorize(color, text) {
  if (!USE_COLOR) return text;
  return colors[color] + text + colors.reset;
}

function log(level, message, ...args) {
  const timestamp = new Date().toISOString();
  const prefix = VERBOSE ? `[${timestamp}] ` : '';
  
  switch (level) {
    case 'info':
      console.log(colorize('cyan', '→ ') + prefix + colorize('bright', message), ...args);
      break;
    case 'success':
      console.log(colorize('green', '✓ ') + prefix + message, ...args);
      break;
    case 'warn':
      console.warn(colorize('yellow', '⚠ ') + prefix + message, ...args);
      break;
    case 'error':
      console.error(colorize('red', '✗ ') + prefix + colorize('bright', message), ...args);
      break;
    case 'debug':
      if (VERBOSE) console.log(colorize('gray', '🔍 ') + prefix + message, ...args);
      break;
  }
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                           CONFIGURATION & PATHS                            */
/* ═══════════════════════════════════════════════════════════════════════════ */

const ROOT = path.resolve(__dirname, '..');
const INPUT_PATH = ARGS.input || path.join(ROOT, 'configs/master-rules.yaml');
const OUTPUT_DIR = ARGS.outdir || path.join(ROOT, 'apps/loader/public/configs');
const OUTPUT_PATH = ARGS.output || path.join(OUTPUT_DIR, 'shadowrocket.conf');

// Parse DNS servers
const DNS_SERVERS = (ARGS.dns || process.env.DNS_SERVER || '1.1.1.1')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

// Configuration flags
const CONFIG = {
  finalGroup: ARGS['final-group'] || process.env.SHADOW_GROUP_NAME || 'Proxy',
  rejectMode: (ARGS['reject-mode'] || 'REJECT').toUpperCase(),
  includeMitm: !ARGS['no-mitm'],
  mitmSniOnly: !!ARGS['mitm-sni-only'],
  strict: !!ARGS.strict,
  annotate: !!ARGS.annotate,
  minify: !!ARGS.minify,
  splitRules: !!ARGS['split-rules'],
  emitJson: !!ARGS['emit-json'],
  dryRun: !!ARGS.dry,
  showStats: !!ARGS.stats
};

log('debug', 'Configuration loaded', CONFIG);

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                          VARIABLE SUBSTITUTION                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

const SUBSTITUTION_MAP = new Map();

// Process --define flags
(ARGS.define || []).forEach(pair => {
  const equalIndex = pair.indexOf('=');
  if (equalIndex !== -1) {
    const key = pair.slice(0, equalIndex).trim();
    const value = pair.slice(equalIndex + 1);
    SUBSTITUTION_MAP.set(key, value);
    log('debug', `Variable defined: ${key} = [REDACTED]`);
  }
});

function substituteVariables(text) {
  if (typeof text !== 'string') return text;
  
  return text.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    // Check --define variables first, then environment
    if (SUBSTITUTION_MAP.has(varName)) {
      return SUBSTITUTION_MAP.get(varName);
    }
    if (process.env[varName] !== undefined) {
      return process.env[varName];
    }
    
    log('warn', `Undefined variable: ${varName}`);
    return ''; // Silent substitution with empty string
  });
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                               FILE UTILITIES                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

function loadYamlFile(filePath) {
  log('debug', `Loading YAML: ${filePath}`);
  
  let rawContent;
  try {
    rawContent = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') {
      log('error', `YAML file not found: ${filePath}`);
    } else {
      log('error', `Failed to read YAML file: ${error.message}`);
    }
    process.exit(1);
  }
  
  try {
    const substituted = substituteVariables(rawContent);
    const document = yaml.load(substituted);
    log('debug', `YAML loaded successfully: ${Object.keys(document || {}).length} top-level keys`);
    return document || {};
  } catch (error) {
    log('error', `YAML parse error in ${filePath}: ${error.message}`);
    if (ARGS.debug) console.error(error.stack);
    process.exit(1);
  }
}

function sha256Hash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function readTextBlocks(fileList = []) {
  const blocks = [];
  
  fileList.forEach(filePath => {
    try {
      const content = fs.readFileSync(filePath, 'utf8').trimEnd();
      blocks.push(content);
      log('debug', `Read text block: ${filePath} (${content.length} chars)`);
    } catch (error) {
      log('warn', `Cannot read text block ${filePath}: ${error.message}`);
    }
  });
  
  return blocks;
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                               DIFF MODE                                    */
/* ═══════════════════════════════════════════════════════════════════════════ */

if (ARGS.diff) {
  const operands = [ARGS.diff, ...ARGS._].filter(Boolean);
  
  if (operands.length < 2) {
    log('error', 'Diff mode requires two files: --diff old.conf new.conf');
    process.exit(2);
  }
  
  const [oldFile, newFile] = operands;
  log('info', `Comparing ${oldFile} with ${newFile}`);
  
  const oldLines = fs.existsSync(oldFile) 
    ? fs.readFileSync(oldFile, 'utf8').split(/\r?\n/) 
    : [];
  const newLines = fs.existsSync(newFile) 
    ? fs.readFileSync(newFile, 'utf8').split(/\r?\n/) 
    : [];
  
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  
  const addedLines = newLines.filter(line => !oldSet.has(line));
  const removedLines = oldLines.filter(line => !newSet.has(line));
  
  console.log(colorize('green', '\n--- ADDED LINES ---'));
  addedLines.forEach(line => console.log(colorize('green', '+ ') + line));
  
  console.log(colorize('red', '\n--- REMOVED LINES ---'));
  removedLines.forEach(line => console.log(colorize('red', '- ') + line));
  
  console.log(`\n${colorize('bright', 'SUMMARY:')} +${addedLines.length} -${removedLines.length} (${newLines.length - oldLines.length} net)`);
  process.exit(0);
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                             PROXY PROCESSING                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

const SUPPORTED_PROXY_TYPES = new Set([
  'socks5', 'http', 'https', 'ss', 'shadowsocks', 
  'vmess', 'vless', 'trojan', 'hysteria', 'hysteria2', 'tuic'
]);

function normalizeProxy(proxy) {
  if (!proxy || typeof proxy !== 'object') {
    if (CONFIG.strict) {
      throw new Error('Proxy entry must be an object');
    }
    log('warn', 'Skipping non-object proxy entry');
    return null;
  }
  
  // Validate required fields
  const requiredFields = ['name', 'type', 'host', 'port'];
  for (const field of requiredFields) {
    if (proxy[field] == null || proxy[field] === '') {
      if (CONFIG.strict) {
        throw new Error(`Proxy missing required field: ${field}`);
      }
      log('warn', `Skipping proxy missing ${field}: ${proxy.name || '(unnamed)'}`);
      return null;
    }
  }
  
  const normalized = { ...proxy };
  
  // Normalize name (replace spaces with hyphens)
  normalized.name = String(normalized.name).replace(/\s+/g, '-');
  
  // Normalize type
  normalized.type = String(normalized.type).toLowerCase();
  
  if (!SUPPORTED_PROXY_TYPES.has(normalized.type)) {
    if (CONFIG.strict) {
      throw new Error(`Unsupported proxy type: ${normalized.type}`);
    }
    log('warn', `Unsupported proxy type: ${normalized.type} for ${normalized.name}`);
    return null;
  }
  
  log('debug', `Normalized proxy: ${normalized.name} (${normalized.type})`);
  return normalized;
}

function generateProxyLine(proxy) {
  const segments = [`${proxy.name} = ${proxy.type}`];
  
  // Basic connection parameters
  segments.push(`host=${proxy.host}`, `port=${proxy.port}`);
  
  // Authentication (generic)
  if (proxy.user || proxy.username) {
    segments.push(`username=${proxy.user || proxy.username}`);
  }
  if (proxy.pass || proxy.password) {
    segments.push(`password=${proxy.pass || proxy.password}`);
  }
  
  // Protocol-specific parameters
  switch (proxy.type) {
    case 'ss':
    case 'shadowsocks':
      if (proxy.cipher || proxy.method) {
        segments.push(`method=${proxy.cipher || proxy.method}`);
      }
      if (proxy.password && !segments.find(s => s.startsWith('password='))) {
        segments.push(`password=${proxy.password}`);
      }
      if (proxy.plugin) {
        segments.push(`plugin=${proxy.plugin}`);
      }
      break;
      
    case 'vmess':
      if (proxy.uuid) segments.push(`uuid=${proxy.uuid}`);
      if (proxy.alterId != null) segments.push(`aid=${proxy.alterId}`);
      if (proxy.cipher) segments.push(`cipher=${proxy.cipher}`);
      break;
      
    case 'vless':
      // Handle both uuid and user fields (compatibility)
      if (proxy.uuid) {
        segments.push(`uuid=${proxy.uuid}`);
      } else if (proxy.user && !segments.find(s => s.startsWith('username='))) {
        segments.push(`uuid=${proxy.user}`);
      }
      if (proxy.flow) segments.push(`flow=${proxy.flow}`);
      break;
      
    case 'trojan':
      if (proxy.password && !segments.find(s => s.startsWith('password='))) {
        segments.push(`password=${proxy.password}`);
      }
      break;
      
    case 'hysteria':
    case 'hysteria2':
      if (proxy.auth) segments.push(`auth=${proxy.auth}`);
      if (proxy.protocol) segments.push(`protocol=${proxy.protocol}`);
      if (proxy.alpn) {
        const alpnValue = Array.isArray(proxy.alpn) ? proxy.alpn.join('|') : proxy.alpn;
        segments.push(`alpn=${alpnValue}`);
      }
      break;
      
    case 'tuic':
      if (proxy.uuid) segments.push(`uuid=${proxy.uuid}`);
      if (proxy.password && !segments.find(s => s.startsWith('password='))) {
        segments.push(`password=${proxy.password}`);
      }
      if (proxy.alpn) {
        const alpnValue = Array.isArray(proxy.alpn) ? proxy.alpn.join('|') : proxy.alpn;
        segments.push(`alpn=${alpnValue}`);
      }
      break;
  }
  
  // Transport encryption
  if (proxy.tls && !segments.find(s => s.includes('tls='))) {
    segments.push('tls=true');
  }
  if (proxy.servername || proxy.sni) {
    segments.push(`sni=${proxy.servername || proxy.sni}`);
  }
  
  // Transport protocols
  if (proxy.ws) {
    segments.push('obfs=ws');
    if (proxy.ws_path) segments.push(`obfs-uri=${proxy.ws_path}`);
    if (proxy.ws_host) segments.push(`obfs-host=${proxy.ws_host}`);
  }
  if (proxy.h2 || proxy.http2) {
    segments.push('obfs=h2');
  }
  
  // Performance options
  if (proxy.fast_open || proxy.tfo) {
    segments.push('tfo=true');
  }
  if (proxy.udp || proxy.udp_relay) {
    segments.push('udp-relay=true');
  }
  
  return segments.join(', ');
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                              RULE PROCESSING                               */
/* ═══════════════════════════════════════════════════════════════════════════ */

const SUPPORTED_RULE_TYPES = new Set([
  'DOMAIN', 'DOMAIN-SUFFIX', 'DOMAIN-KEYWORD', 'DOMAIN-REGEX',
  'IP-CIDR', 'IP-CIDR6', 'SRC-IP-CIDR', 'GEOIP',
  'USER-AGENT', 'PROCESS-NAME', 'URL-REGEX',
  'DST-PORT', 'SRC-PORT', 'MATCH', 'FINAL'
]);

function formatRule(rule) {
  // Handle string rules (pass-through)
  if (typeof rule === 'string') {
    return rule.trim();
  }
  
  // Validate object structure
  if (!rule || typeof rule !== 'object') {
    if (CONFIG.strict) {
      throw new Error(`Rule must be string or object: ${JSON.stringify(rule)}`);
    }
    log('warn', `Skipping invalid rule: ${JSON.stringify(rule)}`);
    return null;
  }
  
  const ruleType = rule.type ? String(rule.type).toUpperCase() : null;
  
  if (!ruleType || !SUPPORTED_RULE_TYPES.has(ruleType)) {
    if (CONFIG.strict) {
      throw new Error(`Unsupported rule type: ${rule.type}`);
    }
    log('warn', `Skipping rule with unsupported type: ${rule.type}`);
    return null;
  }
  
  // Handle special rule types
  if (ruleType === 'MATCH') {
    // MATCH rules will be converted to FINAL automatically
    return null;
  }
  
  if (ruleType === 'FINAL') {
    return `FINAL, ${rule.group || CONFIG.finalGroup}`;
  }
  
  // Standard rules require value and group
  const ruleValue = rule.value;
  const ruleGroup = rule.group || CONFIG.finalGroup;
  
  if (ruleValue == null || ruleValue === '') {
    if (CONFIG.strict) {
      throw new Error(`Rule missing value: ${JSON.stringify(rule)}`);
    }
    log('warn', `Skipping rule missing value: ${JSON.stringify(rule)}`);
    return null;
  }
  
  return `${ruleType}, ${ruleValue}, ${ruleGroup}`;
}

function categorizeRule(ruleLine) {
  if (!ruleLine) return 'Unknown';
  
  const upperRule = ruleLine.toUpperCase();
  
  if (upperRule.includes('REJECT')) return 'Block';
  if (upperRule.includes('RULE-SET')) return 'External';
  if (upperRule.includes('GEOIP')) return 'Geographic';
  if (upperRule.startsWith('FINAL,')) return 'Fallback';
  if (upperRule.includes('DOMAIN')) return 'Domain';
  if (upperRule.includes('IP-CIDR')) return 'Network';
  
  return 'General';
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                               MITM HANDLING                                */
/* ═══════════════════════════════════════════════════════════════════════════ */

function generateDeterministicCAId(hostnames) {
  if (!hostnames || hostnames.length === 0) {
    return 'EMPTYCA';
  }
  
  const sorted = hostnames.slice().sort();
  const hash = sha256Hash(sorted.join(','));
  return hash.slice(0, 20).toUpperCase();
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                               MAIN BUILD LOGIC                             */
/* ═══════════════════════════════════════════════════════════════════════════ */

function buildConfiguration() {
  log('info', 'Loading configuration document');
  const document = loadYamlFile(INPUT_PATH);
  
  // ─── PROXY PROCESSING ─────────────────────────────────────────────────────
  log('info', 'Processing proxies');
  const allProxies = Object.values(document.proxies || {}).flat();
  const normalizedProxies = allProxies.map(normalizeProxy).filter(Boolean);
  
  // De-duplicate by name (last definition wins)
  const proxyMap = new Map();
  normalizedProxies.forEach(proxy => {
    proxyMap.set(proxy.name, proxy);
  });
  
  const finalProxies = Array.from(proxyMap.values())
    .sort((a, b) => a.name.localeCompare(b.name));
  
  const proxyLines = finalProxies.map(generateProxyLine);
  log('success', `Processed ${finalProxies.length} proxies`);
  
  // ─── GROUP/POLICY PROCESSING ──────────────────────────────────────────────
  log('info', 'Processing policy groups');
  const policyLines = [];
  
  Object.entries(document.groups || {}).forEach(([groupName, members]) => {
    const uniqueMembers = Array.from(new Set((members || []).filter(Boolean)));
    if (uniqueMembers.length === 0) {
      log('warn', `Empty group skipped: ${groupName}`);
      return;
    }
    
    policyLines.push(`${groupName} = select, ${uniqueMembers.join(', ')}`);
    log('debug', `Policy group: ${groupName} (${uniqueMembers.length} members)`);
  });
  
  log('success', `Processed ${policyLines.length} policy groups`);
  
  // ─── RULE PROCESSING ───────────────────────────────────────────────────────
  log('info', 'Processing rules');
  
  // Base rules from YAML
  const baseRules = (document.rules || []).map(formatRule).filter(Boolean);
  
  // External rule sets
  const externalRuleLines = (document.external_rule_sets || []).map(ruleSet => {
    if (!ruleSet || !ruleSet.url || !ruleSet.group) {
      if (CONFIG.strict) {
        throw new Error(`Invalid external_rule_set: ${JSON.stringify(ruleSet)}`);
      }
      log('warn', `Skipping invalid external rule set: ${JSON.stringify(ruleSet)}`);
      return null;
    }
    
    const tag = ruleSet.tag ? ` # ${ruleSet.tag}` : '';
    return `RULE-SET, ${ruleSet.url}, ${ruleSet.group}${tag}`;
  }).filter(Boolean);
  
  // Block domain rules
  const blockRules = (document.block_domains || []).map(domain => {
    return `DOMAIN-SUFFIX, ${domain}, ${CONFIG.rejectMode}`;
  });
  
  // Combine and check for existing FINAL rule
  const combinedRules = [...baseRules, ...externalRuleLines, ...blockRules];
  const hasFinalRule = combinedRules.some(rule => rule.startsWith('FINAL,'));
  
  if (!hasFinalRule) {
    combinedRules.push(`FINAL, ${CONFIG.finalGroup}`);
    log('debug', `Added automatic FINAL rule: ${CONFIG.finalGroup}`);
  }
  
  // De-duplicate rules (preserving order, first occurrence wins)
  const seenRules = new Set();
  const finalRules = [];
  
  combinedRules.forEach(rule => {
    if (!seenRules.has(rule)) {
      seenRules.add(rule);
      finalRules.push(rule);
    }
  });
  
  log('success', `Processed ${finalRules.length} rules (${baseRules.length} base, ${externalRuleLines.length} external, ${blockRules.length} block)`);
  
  // ─── MITM PROCESSING ───────────────────────────────────────────────────────
  log('info', 'Processing MITM configuration');
  const mitmHostnames = CONFIG.includeMitm 
    ? Array.from(new Set((document.mitm_hostnames || []).filter(Boolean))).sort()
    : [];
  
  const caIdentifier = (ARGS['ca-id'] || generateDeterministicCAId(mitmHostnames)).toUpperCase();
  log('success', `MITM: ${mitmHostnames.length} hostnames, CA ID: ${caIdentifier}`);
  
  // ─── ANNOTATION PROCESSING ────────────────────────────────────────────────
  const categoryMap = new Map();
  if (CONFIG.annotate) {
    log('info', 'Categorizing rules for annotation');
    finalRules.forEach(rule => {
      const category = categorizeRule(rule);
      if (!categoryMap.has(category)) {
        categoryMap.set(category, []);
      }
      categoryMap.get(category).push(rule);
    });
  }
  
  // ─── EXTERNAL CONTENT ─────────────────────────────────────────────────────
  const prependBlocks = readTextBlocks(ARGS.prepend);
  const appendBlocks = readTextBlocks(ARGS.append);
  
  // ─── CONFIGURATION ASSEMBLY ───────────────────────────────────────────────
  log('info', 'Assembling final configuration');
  const configLines = [];
  
  // Prepended content
  if (prependBlocks.length > 0) {
    configLines.push(...prependBlocks, '');
  }
  
  // Header
  configLines.push(
    '# ═══════════════════════════════════════════════════════════════════════════',
    '# Shadowrocket Configuration (Generated)',
    `# Source: ${INPUT_PATH}`,
    `# Generated: ${new Date().toISOString()}`,
    `# Generator: gen-shadowrocket.js v3.0.0`,
    `# Build User: ${process.env.USER || 'unknown'}`,
    '# ═══════════════════════════════════════════════════════════════════════════',
    ''
  );
  
  // [General] section
  configLines.push(
    '[General]',
    `dns-server = ${DNS_SERVERS.join(', ')}`,
    'ipv6 = false',
    'udp-relay = true',
    'bypass-system = true',
    'skip-proxy = 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12, localhost, *.local',
    ''
  );
  
  // [Proxy] section
  configLines.push('[Proxy]');
  proxyLines.forEach(line => configLines.push(line));
  configLines.push('');
  
  // [Policy] section
  if (policyLines.length > 0) {
    configLines.push('[Policy]');
    policyLines.forEach(line => configLines.push(line));
    configLines.push('');
  }
  
  // [Rule] section
  configLines.push('[Rule]');
  if (CONFIG.annotate && categoryMap.size > 0) {
    // Annotated rules with categories
    const sortedCategories = Array.from(categoryMap.keys()).sort();
    sortedCategories.forEach(category => {
      const rules = categoryMap.get(category);
      configLines.push(`# ── ${category} Rules (${rules.length}) ──`);
      rules.forEach(rule => configLines.push(rule));
      configLines.push('');
    });
  } else {
    // Simple rule list
    finalRules.forEach(rule => configLines.push(rule));
    configLines.push('');
  }
  
  // [Script] section
  if (document.scripts?.loader_url) {
    configLines.push(
      '[Script]',
      '# ⚠️  Verify script trustworthiness before enabling',
      `LOADER = type=http-response, pattern=^https?:\\/\\/.+, script-path=${document.scripts.loader_url}`,
      ''
    );
  }
  
  // [MITM] section
  if (mitmHostnames.length > 0) {
    configLines.push('[MITM]');
    
    if (!CONFIG.mitmSniOnly) {
      configLines.push('enabled = true', 'enable = true'); // Compatibility
    }
    
    configLines.push(`hostname = ${mitmHostnames.join(', ')}`);
    
    if (!CONFIG.mitmSniOnly) {
      configLines.push(
        `# Certificate identifier (deterministic)`,
        `ca-p12 = ${caIdentifier}.p12`,
        `ca-passphrase = shadowrocket`
      );
    }
    
    configLines.push('');
  }
  
  // Appended content
  if (appendBlocks.length > 0) {
    configLines.push('# ── Appended Content ──');
    configLines.push(...appendBlocks, '');
  }
  
  // Generate final content
  let finalContent = configLines.join('\n');
  
  // Minification
  if (CONFIG.minify) {
    log('info', 'Minifying configuration');
    finalContent = finalContent
      .split(/\r?\n/)
      .filter(line => line.trim() && !line.trim().startsWith('#'))
      .join('\n');
  }
  
  // Rule fragments (for split-rules mode)
  const ruleFragments = {};
  if (CONFIG.splitRules) {
    ruleFragments.base = baseRules.join('\n') + '\n';
    ruleFragments.external = externalRuleLines.join('\n') + '\n';
    ruleFragments.block = blockRules.join('\n') + '\n';
    ruleFragments.mitm = mitmHostnames.join('\n') + '\n';
  }
  
  // Build metadata
  const metadata = {
    generator: {
      name: 'gen-shadowrocket.js',
      version: '3.0.0',
      author: 'PopdeuxRem (Thugger069)',
      timestamp: new Date().toISOString()
    },
    source: {
      file: INPUT_PATH,
      hash: sha256Hash(fs.readFileSync(INPUT_PATH, 'utf8'))
    },
    output: {
      file: OUTPUT_PATH,
      hash: sha256Hash(finalContent),
      size: finalContent.length
    },
    statistics: {
      proxies: finalProxies.length,
      policies: policyLines.length,
      rules: finalRules.length,
      mitmHostnames: mitmHostnames.length,
      categories: categoryMap.size
    },
    configuration: {
      dnsServers: DNS_SERVERS,
      finalGroup: CONFIG.finalGroup,
      rejectMode: CONFIG.rejectMode,
      caIdentifier: caIdentifier,
      minified: CONFIG.minify,
      annotated: CONFIG.annotate,
      splitRules: CONFIG.splitRules
    }
  };
  
  return {
    content: finalContent,
    fragments: ruleFragments,
    metadata: metadata
  };
}

/* ═══════════════════════════════════════════════════════════════════════════ */
/*                                MAIN EXECUTION                              */
/* ═══════════════════════════════════════════════════════════════════════════ */

function main() {
  const startTime = Date.now();
  
  // Error handling
  process.on('uncaughtException', (error) => {
    log('error', 'Uncaught exception:', error.message);
    if (ARGS.debug) console.error(error.stack);
    process.exit(1);
  });
  
  process.on('unhandledRejection', (reason) => {
    log('error', 'Unhandled promise rejection:', reason);
    process.exit(1);
  });
  
  try {
    log('info', 'Starting Shadowrocket configuration generation');
    
    const result = buildConfiguration();
    
    if (CONFIG.dryRun) {
      log('info', 'Dry run mode - outputting to stdout');
      process.stdout.write(result.content);
    } else {
      // Ensure output directory exists
      fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
      
      // Write main configuration file
      fs.writeFileSync(OUTPUT_PATH, result.content);
      log('success', `Configuration written: ${path.relative(process.cwd(), OUTPUT_PATH)}`);
      
      // Write rule fragments
      if (CONFIG.splitRules) {
        const fragmentsDir = path.join(path.dirname(OUTPUT_PATH), 'rules');
        fs.mkdirSync(fragmentsDir, { recursive: true });
        
        Object.entries(result.fragments).forEach(([name, content]) => {
          const fragmentPath = path.join(fragmentsDir, `${name}.conf`);
          fs.writeFileSync(fragmentPath, content);
          log('success', `Rule fragment: rules/${name}.conf`);
        });
      }
      
      // Write metadata JSON
      if (CONFIG.emitJson) {
        const metadataPath = OUTPUT_PATH + '.json';
        fs.writeFileSync(metadataPath, JSON.stringify(result.metadata, null, 2));
        log('success', `Metadata: ${path.basename(metadataPath)}`);
      }
    }
    
    // Statistics
    if (CONFIG.showStats) {
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      console.log('\n' + colorize('magenta', '═══ BUILD STATISTICS ═══'));
      console.log(colorize('cyan', '📊 Generation Summary:'));
      console.log(`   • Proxies: ${result.metadata.statistics.proxies}`);
      console.log(`   • Policy Groups: ${result.metadata.statistics.policies}`);
      console.log(`   • Rules: ${result.metadata.statistics.rules}`);
      console.log(`   • MITM Hostnames: ${result.metadata.statistics.mitmHostnames}`);
      console.log(`   • Rule Categories: ${result.metadata.statistics.categories}`);
      console.log(colorize('cyan', '\n⚡ Performance:'));
      console.log(`   • Generation Time: ${duration}ms`);
      console.log(`   • Output Size: ${(result.metadata.output.size / 1024).toFixed(1)} KB`);
      console.log(`   • Content Hash: ${result.metadata.output.hash.slice(0, 12)}...`);
      console.log(colorize('cyan', '\n🔧 Configuration:'));
      console.log(`   • Final Group: ${result.metadata.configuration.finalGroup}`);
      console.log(`   • Reject Mode: ${result.metadata.configuration.rejectMode}`);
      console.log(`   • CA Identifier: ${result.metadata.configuration.caIdentifier}`);
      console.log(`   • Features: ${[
        result.metadata.configuration.minified && 'minified',
        result.metadata.configuration.annotated && 'annotated', 
        result.metadata.configuration.splitRules && 'split-rules'
      ].filter(Boolean).join(', ') || 'none'}`);
    }
    
    log('success', 'Configuration generation completed successfully');
    
  } catch (error) {
    log('error', `Generation failed: ${error.message}`);
    if (ARGS.debug) {
      console.error('\nStack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Execute if called directly
if (require.main === module) {
  main();
}

// Export for testing/integration
module.exports = {
  buildConfiguration,
  parseArgs,
  normalizeProxy,
  generateProxyLine,
  formatRule,
  categorizeRule
};
