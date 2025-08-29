#!/usr/bin/env node
/**
 * scripts/gen-stash.js
 * Enhanced Stash/Clash Configuration Generator
 * 
 * Builds optimized Stash/Clash-style configuration from master-rules.yaml
 * with support for advanced proxy types, security validation, and extended rule formats.
 *
 * @author: PopdeuxRem
 * @updated: 2025-08-29 21:38:26 UTC
 * @version: 2.1.0
 * 
 * Input shape (master-rules.yaml):
 *   proxies:
 *     us: [ { type: vless|http|socks5|vmess|trojan|ss, name, host, port, ... }, ... ]
 *   groups:
 *     US: [ "PROXY_NAME", ... ]
 *   rules: [ { type, value, group?, no_resolve? }, ... ]
 *   external_rule_sets: [ { url, group, behavior? }, ... ]
 *
 * Output:
 *   apps/loader/public/configs/stash.conf
 */

'use strict';

// ─── Core Dependencies ───────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
const { URL } = require('url');

// ─── Command Line Arguments & Configuration ─────────────────────────────────────
const argv = require('minimist')(process.argv.slice(2), {
  string: ['input', 'output', 'final-group'],
  boolean: ['debug', 'stats', 'auto-test', 'secure', 'emit-json'],
  default: {
    'debug': false,
    'stats': false,
    'secure': true,
    'emit-json': false,
    'auto-test': true,
    'final-group': 'Proxy'
  },
  alias: {
    i: 'input',
    o: 'output',
    d: 'debug',
    s: 'stats',
    f: 'final-group'
  }
});

// ─── Constants & Paths ──────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const IN_FILE = argv.input || path.join(ROOT, 'configs', 'master-rules.yaml');
const OUT_DIR = path.join(ROOT, 'apps/loader/public/configs');
const OUT_FILE = argv.output || path.join(OUT_DIR, 'stash.conf');
const STATS_FILE = path.join(OUT_DIR, 'stash.stats.json');
const DEBUG = argv.debug;
const FINAL_GROUP = argv['final-group'];
const DEFAULT_PORT = 7890;
const DEFAULT_DNS_SERVERS = ['1.1.1.1', '8.8.8.8'];
const DEFAULT_FALLBACK_DNS = ['https://freedns.controld.com/p2', 'https://dns.cloudflare.com/dns-query'];
const DEFAULT_HEALTH_CHECK_URL = 'https://www.gstatic.com/generate_204';
const DEFAULT_HEALTH_CHECK_INTERVAL = 300;

// ─── Helper Functions ──────────────────────────────────────────────────────────
const log = (...args) => DEBUG && console.log('[DEBUG]', ...args);
const warn = (m) => console.warn('[WARN]', m);
const die = (m) => { console.error('[ERROR]', m); process.exit(1); };
const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const sanitizeForLog = (obj) => {
  // Create a deep copy to avoid modifying the original
  const result = JSON.parse(JSON.stringify(obj));
  const sensitiveFields = ['password', 'pass', 'uuid', 'secret', 'token', 'key'];
  
  const sanitize = (o) => {
    if (typeof o !== 'object' || o === null) return;
    
    Object.keys(o).forEach(k => {
      if (sensitiveFields.includes(k.toLowerCase())) {
        o[k] = '[REDACTED]';
      } else if (typeof o[k] === 'object') {
        sanitize(o[k]);
      }
    });
  };
  
  sanitize(result);
  return result;
};

// ─── File Validation ───────────────────────────────────────────────────────────
if (!fs.existsSync(IN_FILE)) {
  die(`Input file not found: ${path.relative(ROOT, IN_FILE)}`);
}

// Ensure output directory exists
try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.accessSync(OUT_DIR, fs.constants.W_OK);
} catch (err) {
  die(`Cannot write to output directory: ${err.message}`);
}

// ─── Parse Master Config ──────────────────────────────────────────────────────
let master;

try {
  const yamlContent = fs.readFileSync(IN_FILE, 'utf8');
  master = yaml.load(yamlContent) || {};
  
  // Basic structure validation
  if (!master.proxies || typeof master.proxies !== 'object') {
    throw new Error('Missing or invalid "proxies" section in master config');
  }
} catch (err) {
  die(`Error parsing ${path.relative(ROOT, IN_FILE)}: ${err.message}`);
}

// Extract configuration components
const proxiesByRegion = master.proxies || {};
const groups = master.groups || {};
const rules = Array.isArray(master.rules) ? master.rules : [];
const ers = Array.isArray(master.external_rule_sets) ? master.external_rule_sets : [];
const config = master.config || {};

// Metadata for tracking
const metadata = {
  version: '2.1.0',
  timestamp: new Date().toISOString(),
  author: 'PopdeuxRem',
  filename: path.basename(OUT_FILE),
  stats: {
    proxies: 0,
    proxyGroups: 0,
    rules: 0,
    ruleProviders: 0
  }
};

// ─── Enhanced Proxy Type Support ──────────────────────────────────────────────
/**
 * Maps various proxy types to Stash/Clash format with enhanced validation
 * @param {Object} p - Proxy configuration object
 * @returns {Object} Stash/Clash compatible proxy configuration
 * @throws {Error} If the proxy configuration is invalid
 */
function mapProxy(p) {
  // Input validation
  if (!p || typeof p !== 'object') {
    throw new Error('Invalid proxy object');
  }
  
  if (!p.name || !p.host || !p.port) {
    throw new Error(`Proxy missing required fields: ${JSON.stringify(sanitizeForLog(p))}`);
  }
  
  const t = (p.type || '').toLowerCase();
  
  // Type-specific mapping
  switch (t) {
    case 'http':
      const httpProxy = {
        name: p.name,
        type: 'http',
        server: p.host,
        port: Number(p.port)
      };
      
      if (p.user) httpProxy.username = p.user;
      if (p.pass) httpProxy.password = p.pass;
      if (p.tls) {
        httpProxy.tls = true;
        if (has(p, 'skip-cert-verify')) {
          httpProxy['skip-cert-verify'] = !!p['skip-cert-verify'];
        }
        if (p.sni || p.servername) {
          httpProxy.sni = p.sni || p.servername;
        }
      }
      
      return httpProxy;
      
    case 'socks5':
    case 'socks':
      const socksProxy = {
        name: p.name,
        type: 'socks5',
        server: p.host,
        port: Number(p.port)
      };
      
      if (p.user) socksProxy.username = p.user;
      if (p.pass) socksProxy.password = p.pass;
      if (has(p, 'udp')) socksProxy.udp = !!p.udp;
      
      return socksProxy;
      
    case 'ss':
    case 'shadowsocks':
      // Validate required Shadowsocks fields
      if (!p.method || !p.password) {
        throw new Error(`Shadowsocks proxy missing required fields: ${p.name}`);
      }
      
      const ssProxy = {
        name: p.name,
        type: 'ss',
        server: p.host,
        port: Number(p.port),
        cipher: p.method,
        password: p.password
      };
      
      // Optional Shadowsocks fields
      if (has(p, 'udp')) ssProxy.udp = !!p.udp;
      if (p.plugin) {
        ssProxy.plugin = p.plugin;
        if (p['plugin-opts']) {
          ssProxy['plugin-opts'] = p['plugin-opts'];
        }
      }
      
      return ssProxy;
      
    case 'vmess':
      // Validate required VMess fields
      if (!p.uuid && !p.id) {
        throw new Error(`VMess proxy missing uuid/id: ${p.name}`);
      }
      
      const vmessProxy = {
        name: p.name,
        type: 'vmess',
        server: p.host,
        port: Number(p.port),
        uuid: p.uuid || p.id,
        alterId: p.alterId || p['alter-id'] || 0,
        cipher: p.cipher || 'auto'
      };
      
      // Network settings
      if (p.network) {
        vmessProxy.network = p.network;
        
        if (p.network === 'ws') {
          vmessProxy['ws-opts'] = {
            path: p.path || p['ws-path'] || '/',
            headers: p.headers || {}
          };
        } else if (p.network === 'h2') {
          vmessProxy['h2-opts'] = {
            host: p['h2-host'] || [p.host],
            path: p.path || p['h2-path'] || '/'
          };
        } else if (p.network === 'http') {
          vmessProxy['http-opts'] = {
            path: p.path || ['/'],
            headers: p.headers || {}
          };
        } else if (p.network === 'grpc') {
          vmessProxy['grpc-opts'] = {
            'grpc-service-name': p['grpc-service-name'] || p.serviceName || ''
          };
        }
      }
      
      // TLS settings
      if (p.tls) {
        vmessProxy.tls = true;
        if (p.sni || p.servername) {
          vmessProxy.servername = p.sni || p.servername;
        }
        if (has(p, 'skip-cert-verify')) {
          vmessProxy['skip-cert-verify'] = !!p['skip-cert-verify'];
        }
        
        // Client fingerprint
        if (p.fingerprint) {
          vmessProxy['client-fingerprint'] = p.fingerprint;
        }
      }
      
      return vmessProxy;
      
    case 'vless':
      // Validate required VLESS fields
      if (!p.uuid && !p.user) {
        throw new Error(`VLESS proxy missing uuid: ${p.name}`);
      }
      
      const vlessProxy = {
        name: p.name,
        type: 'vless',
        server: p.host,
        port: Number(p.port),
        uuid: p.uuid || p.user,
        flow: p.flow || ''
      };
      
      // Network settings (similar to vmess)
      if (p.network) {
        vlessProxy.network = p.network;
        
        if (p.network === 'ws') {
          vlessProxy['ws-opts'] = {
            path: p.path || p['ws-path'] || '/',
            headers: p.headers || {}
          };
        } else if (p.network === 'h2') {
          vlessProxy['h2-opts'] = {
            host: p['h2-host'] || [p.host],
            path: p.path || p['h2-path'] || '/'
          };
        } else if (p.network === 'http') {
          vlessProxy['http-opts'] = {
            path: p.path || ['/'],
            headers: p.headers || {}
          };
        } else if (p.network === 'grpc') {
          vlessProxy['grpc-opts'] = {
            'grpc-service-name': p['grpc-service-name'] || p.serviceName || ''
          };
        }
      }
      
      // TLS settings
      if (p.tls) {
        vlessProxy.tls = true;
        if (p.sni || p.servername) {
          vlessProxy.servername = p.sni || p.servername;
        }
        if (has(p, 'skip-cert-verify')) {
          vlessProxy['skip-cert-verify'] = !!p['skip-cert-verify'];
        }
        
        // Client fingerprint
        if (p.fingerprint) {
          vlessProxy['client-fingerprint'] = p.fingerprint;
        }
      }
      
      return vlessProxy;
      
    case 'trojan':
      // Validate required Trojan fields
      if (!p.password) {
        throw new Error(`Trojan proxy missing password: ${p.name}`);
      }
      
      const trojanProxy = {
        name: p.name,
        type: 'trojan',
        server: p.host,
        port: Number(p.port),
        password: p.password
      };
      
      // TLS settings (required for Trojan)
      trojanProxy.sni = p.sni || p.servername || p.host;
      
      if (has(p, 'skip-cert-verify')) {
        trojanProxy['skip-cert-verify'] = !!p['skip-cert-verify'];
      }
      
      // Additional optional fields
      if (has(p, 'udp')) trojanProxy.udp = !!p.udp;
      if (has(p, 'alpn')) trojanProxy.alpn = p.alpn;
      
      // Client fingerprint for TLS
      if (p.fingerprint) {
        trojanProxy['client-fingerprint'] = p.fingerprint;
      }
      
      // Network options (grpc, ws)
      if (p.network === 'grpc') {
        trojanProxy.network = 'grpc';
        trojanProxy['grpc-opts'] = {
          'grpc-service-name': p['grpc-service-name'] || p.serviceName || ''
        };
      } else if (p.network === 'ws') {
        trojanProxy.network = 'ws';
        trojanProxy['ws-opts'] = {
          path: p.path || p['ws-path'] || '/',
          headers: p.headers || {}
        };
      }
      
      return trojanProxy;
      
    default:
      throw new Error(`Unsupported proxy type: ${t} for proxy ${p.name}`);
  }
}

// ─── Security Validation Functions ───────────────────────────────────────────────
/**
 * Validates security aspects of proxy configurations
 * @param {Object} proxy - Proxy configuration object
 * @returns {Array} List of security warnings or empty array if none
 */
function validateProxySecure(proxy) {
  const warnings = [];
  
  if (argv.secure) {
    // Check for weak security settings
    if (proxy['skip-cert-verify'] === true) {
      warnings.push(`Proxy "${proxy.name}" has TLS certificate verification disabled`);
    }
    
    // Check for deprecated or insecure cipher methods in SS proxies
    if (proxy.type === 'ss' && ['rc4-md5', 'aes-128-ctr', 'aes-192-ctr', 'aes-256-ctr', 'bf-cfb', 'rc4', 'des-cfb', 'table'].includes(proxy.cipher)) {
      warnings.push(`Proxy "${proxy.name}" uses potentially insecure cipher: ${proxy.cipher}`);
    }
    
    // Check for missing SNI in TLS connections
    if ((proxy.tls === true || proxy.type === 'trojan') && !proxy.sni && !proxy.servername) {
      warnings.push(`Proxy "${proxy.name}" is missing SNI for TLS connection`);
    }
  }
  
  return warnings;
}

// ─── Rule Processing Functions ──────────────────────────────────────────────────
/**
 * Formats rules for Stash/Clash configuration
 * @param {Array} rules - Array of rule objects
 * @returns {Array} Formatted rules for Stash/Clash
 */
function formatRules(rules) {
  if (!Array.isArray(rules) || rules.length === 0) {
    return [];
  }
  
  return rules.map(r => {
    if (!r.type || !r.value || !r.group) {
      warn(`Skipping invalid rule: ${JSON.stringify(r)}`);
      return null;
    }
    
    // Format as Clash/Stash rule string
    let ruleStr = `${r.type},${r.value},${r.group}`;
    
    // Add no-resolve flag if specified
    if (r.no_resolve === true) {
      ruleStr += ',no-resolve';
    }
    
    return ruleStr;
  }).filter(Boolean); // Remove null entries
}

/**
 * Processes external rule sets into rule providers
 * @param {Array} ers - External rule sets configuration
 * @returns {Object} Rule providers configuration for Stash/Clash
 */
function processRuleProviders(ers) {
  if (!Array.isArray(ers) || ers.length === 0) {
    return {};
  }
  
  const providers = {};
  
  ers.forEach((ruleset, index) => {
    if (!ruleset.url || !ruleset.group) {
      warn(`Skipping invalid external rule set at index ${index}`);
      return;
    }
    
    try {
      // Generate a provider name from the URL if none specified
      const urlObj = new URL(ruleset.url);
      const name = ruleset.name || `ruleset-${crypto.createHash('md5').update(ruleset.url).digest('hex').slice(0, 8)}`;
      
      providers[name] = {
        type: 'http',
        behavior: ruleset.behavior || 'domain',
        url: ruleset.url,
        path: `./rule_providers/${name}.yaml`,
        interval: ruleset.interval || 86400,
      };
      
      // Add a rule to use this provider
      rules.push({
        type: 'RULE-SET',
        value: name,
        group: ruleset.group
      });
      
      metadata.stats.ruleProviders++;
    } catch (err) {
      warn(`Invalid URL in external rule set: ${ruleset.url}: ${err.message}`);
    }
  });
  
  return providers;
}

// ─── Main Configuration Generator ───────────────────────────────────────────────
/**
 * Generates the Stash/Clash configuration from all components
 * @returns {Object} Complete Stash/Clash configuration object
 */
function generateConfig() {
  // Initialize base configuration
  const stashConfig = {
    mixed-port: config.port || DEFAULT_PORT,
    allow-lan: config['allow-lan'] !== undefined ? config['allow-lan'] : true,
    bind-address: config['bind-address'] || '*',
    mode: config.mode || 'rule',
    log-level: config['log-level'] || 'info',
    ipv6: config.ipv6 !== undefined ? config.ipv6 : true,
    external-controller: config['external-controller'] || '127.0.0.1:9090',
    proxies: [],
    proxy-groups: [],
    rules: []
  };
  
  // DNS Configuration
  stashConfig.dns = {
    enable: true,
    listen: config.dns?.listen || '0.0.0.0:53',
    ipv6: config.dns?.ipv6 !== undefined ? config.dns.ipv6 : false,
    nameserver: config.dns?.nameserver || DEFAULT_DNS_SERVERS,
    'fallback-filter': {
      geoip: true,
      'geoip-code': config.dns?.['fallback-filter']?.['geoip-code'] || 'CN',
      ipcidr: config.dns?.['fallback-filter']?.ipcidr || ['240.0.0.0/4']
    }
  };
  
  if (config.dns?.fallback) {
    stashConfig.dns.fallback = config.dns.fallback;
  } else {
    stashConfig.dns.fallback = DEFAULT_FALLBACK_DNS;
  }
  
  // Process all proxy configurations by region
  const allProxies = [];
  const securityWarnings = [];
  
  Object.entries(proxiesByRegion).forEach(([region, proxies]) => {
    if (!Array.isArray(proxies) || proxies.length === 0) {
      return;
    }
    
    log(`Processing ${proxies.length} proxies from region: ${region}`);
    
    // Map each proxy to Stash/Clash format
    proxies.forEach(p => {
      try {
        const mappedProxy = mapProxy(p);
        allProxies.push(mappedProxy);
        
        // Check for security issues
        const warnings = validateProxySecure(mappedProxy);
        securityWarnings.push(...warnings);
        
        metadata.stats.proxies++;
      } catch (err) {
        warn(`Failed to process proxy: ${err.message}`);
      }
    });
  });
  
  // Display security warnings
  if (securityWarnings.length > 0) {
    console.warn('\n[SECURITY WARNINGS]');
    securityWarnings.forEach(w => console.warn(`- ${w}`));
    console.warn('');
  }
  
  // Add all proxies to configuration
  stashConfig.proxies = allProxies;
  
  // Process proxy groups
  const proxyGroups = [];
  
  // Add the main proxy selector group
  const mainGroup = {
    name: FINAL_GROUP,
    type: 'select',
    proxies: []
  };
  
  // Process user-defined groups
  Object.entries(groups).forEach(([groupName, proxyNames]) => {
    if (!Array.isArray(proxyNames) || proxyNames.length === 0) {
      return;
    }
    
    // Validate that all proxies in this group exist
    const validProxies = proxyNames.filter(name => 
      allProxies.some(p => p.name === name)
    );
    
    if (validProxies.length === 0) {
      warn(`Group "${groupName}" has no valid proxies, skipping`);
      return;
    }
    
    // Create the group with automatic health checking
    const group = {
      name: groupName,
      type: config.groups?.[groupName]?.type || 'url-test',
      proxies: validProxies,
      url: config.groups?.[groupName]?.url || DEFAULT_HEALTH_CHECK_URL,
      interval: config.groups?.[groupName]?.interval || DEFAULT_HEALTH_CHECK_INTERVAL
    };
    
    // Add optional tolerance parameter if specified
    if (config.groups?.[groupName]?.tolerance) {
      group.tolerance = config.groups[groupName].tolerance;
    }
    
    proxyGroups.push(group);
    mainGroup.proxies.push(groupName);
    
    metadata.stats.proxyGroups++;
  });
  
  // Add main group if it has any entries
  if (mainGroup.proxies.length > 0) {
    proxyGroups.unshift(mainGroup);
    metadata.stats.proxyGroups++;
  }
  
  // Add special groups from configuration
  if (config['special-groups']) {
    config['special-groups'].forEach(group => {
      proxyGroups.push(group);
      metadata.stats.proxyGroups++;
    });
  }
  
  // Add auto-test direct group if requested
  if (argv['auto-test']) {
    proxyGroups.push({
      name: 'DIRECT',
      type: 'select',
      proxies: ['DIRECT']
    });
    metadata.stats.proxyGroups++;
  }
  
  // Add proxy groups to configuration
  stashConfig['proxy-groups'] = proxyGroups;
  
  // Process rules
  const formattedRules = formatRules(rules);
  stashConfig.rules = formattedRules;
  metadata.stats.rules = formattedRules.length;
  
  // Process rule providers
  const ruleProviders = processRuleProviders(ers);
  if (Object.keys(ruleProviders).length > 0) {
    stashConfig['rule-providers'] = ruleProviders;
  }
  
  // Add a final catch-all rule if none specified
  if (!formattedRules.some(r => r.startsWith('MATCH,'))) {
    stashConfig.rules.push('MATCH,DIRECT');
  }
  
  return stashConfig;
}

// ─── Main Execution ────────────────────────────────────────────────────────────
try {
  console.log(`Generating Stash/Clash configuration from ${path.relative(ROOT, IN_FILE)}...`);
  
  const startTime = process.hrtime();
  const config = generateConfig();
  
  // Calculate generation time
  const hrend = process.hrtime(startTime);
  const execTimeMs = hrend[0] * 1000 + hrend[1] / 1000000;
  metadata.generationTime = `${execTimeMs.toFixed(2)}ms`;
  
  // Add metadata to configuration as comments
  const yamlConfig = yaml.dump(config, { lineWidth: 120, noRefs: true });
  const finalConfig = [
    `# Stash/Clash configuration generated by gen-stash.js v${metadata.version}`,
    `# Generated at: ${metadata.timestamp}`,
    `# Proxies: ${metadata.stats.proxies}, Groups: ${metadata.stats.proxyGroups}, Rules: ${metadata.stats.rules}, Rule Providers: ${metadata.stats.ruleProviders}`,
    `# Generation time: ${metadata.generationTime}`,
    yamlConfig
  ].join('\n');
  
  // Write YAML configuration
  fs.writeFileSync(OUT_FILE, finalConfig);
  console.log(`Configuration saved to ${path.relative(ROOT, OUT_FILE)}`);
  
  // Write JSON stats file if requested
  if (argv.stats) {
    fs.writeFileSync(STATS_FILE, JSON.stringify(metadata, null, 2));
    console.log(`Statistics saved to ${path.relative(ROOT, STATS_FILE)}`);
  }
  
  // Write JSON configuration if requested
  if (argv['emit-json']) {
    const jsonOutFile = OUT_FILE.replace(/\.conf$/, '.json');
    fs.writeFileSync(jsonOutFile, JSON.stringify(config, null, 2));
    console.log(`JSON configuration saved to ${path.relative(ROOT, jsonOutFile)}`);
  }
  
  console.log(`Done! (${execTimeMs.toFixed(2)}ms)`);
} catch (err) {
  die(`Error generating configuration: ${err.stack || err.message}`);
}
