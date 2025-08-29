#!/usr/bin/env node
/**
 * scripts/gen-stash.js
 * Enhanced Stash/Clash Configuration Generator
 * 
 * Builds optimized Stash/Clash-style configuration from master-rules.yaml
 * with support for advanced proxy types, security validation, and extended rule formats.
 *
 * @author: PopdeuxRem
 * @updated: 2025-08-29 05:21:47 UTC
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
        uuid: p.
