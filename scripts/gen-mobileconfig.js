/**
 * scripts/gen-mobileconfig.js - Enterprise DNS Profile Generator
 * 
 * Generates Apple configuration profiles (.mobileconfig) for DNS over HTTPS (DoH) and
 * DNS over TLS (DoT) with advanced customization options and provider management.
 * 
 * Features:
 *  - Multiple identifier styles (default|infix|flat)
 *  - IPv4/IPv6 address support with comprehensive validation
 *  - Split profile generation (individual + aggregate profiles)
 *  - Minimal mode for single provider output
 *  - Deterministic or random UUID generation with optional salt
 *  - Profile signing capability with CMS integration
 *  - Domain-specific DNS configuration for selective routing
 *  - Custom DNS provider creation with flexible configuration
 *  - Enhanced security validation and error handling
 *  - Comprehensive logging with quiet/verbose options
 *  - Performance optimizations for large configurations
 * 
 * Examples:
 *  - Basic: node scripts/gen-mobileconfig.js --provider cloudflare
 *  - NextDNS: node scripts/gen-mobileconfig.js --provider nextdns --nextdns-id=5619c1
 *  - Multiple: node scripts/gen-mobileconfig.js --providers nextdns,cloudflare --nextdns-id=5619c1 --dot
 *  - All providers: node scripts/gen-mobileconfig.js --all --dot --randomize
 *  - Custom: node scripts/gen-mobileconfig.js --provider custom --doh-url=https://example.com/dns-query
 *  - Advanced: node scripts/gen-mobileconfig.js --provider nextdns --nextdns-id=5619c1 \
 *      --addrs 45.90.28.0,45.90.30.0 --addrs6 2a07:a8c0::,2a07:a8c1:: \
 *      --output ./dist/nextdns.mobileconfig --domains example.com,example.org
 * 
 * @version 2.0.0
 * @author PopduexRem
 * @updated 2025-08-29
 */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

////////////////////////////////////////////////////////////////////////////////
// Environment & Configuration
////////////////////////////////////////////////////////////////////////////////

const ENV = {
  // Organization and display information
  ORG: process.env.DNS_ORG || 'popdeuxrem',
  DISPLAY: process.env.DNS_DISPLAY || 'Shadow-Scripts • Secure DNS',
  DESCRIPTION: process.env.DNS_DESCRIPTION || 'Secure DNS configuration with encrypted DNS queries',
  
  // Output paths and identifiers
  OUTPUT: process.env.DNS_OUTPUT || path.resolve(__dirname, '../apps/loader/public/configs/shadow_doh.mobileconfig'),
  PROFILE_ID: process.env.DNS_PROFILE_ID || 'com.popdeuxrem.shadow.dns',
  
  // Security and verification
  SIGN_IDENTITY: process.env.DNS_SIGN_IDENTITY || '',
  SIGN_ENABLED: process.env.DNS_SIGN_ENABLED === 'true',
  
  // Performance settings
  BATCH_SIZE: parseInt(process.env.DNS_BATCH_SIZE || '25', 10),
  
  // Build information
  BUILD_VERSION: '2.0.0',
  BUILD_DATE: new Date().toISOString(),
};

// Stable namespace UUID for deterministic generation
const PROFILE_NAMESPACE = '0f0fdc57-dc5d-5c4b-9e02-77c683d4c9a1';

// Default providers when none specified
const DEFAULT_PROVIDERS = ['cloudflare'];

// Provider configuration templates with detailed specifications
const PROVIDER_PRESETS = {
  cloudflare: {
    doh: {
      serverURL: 'https://cloudflare-dns.com/dns-query',
      serverName: 'cloudflare-dns.com',
      addrs: ['1.1.1.1', '1.0.0.1'],
      addrs6: ['2606:4700:4700::1111', '2606:4700:4700::1001'],
      description: 'Cloudflare DoH (1.1.1.1)',
      supplementalMatchDomains: [],
    },
    dot: {
      serverName: 'cloudflare-dns.com',
      addrs: ['1.1.1.1', '1.0.0.1'],
      addrs6: ['2606:4700:4700::1111', '2606:4700:4700::1001'],
      description: 'Cloudflare DoT (1.1.1.1)',
      supplementalMatchDomains: [],
    },
  },
  
  google: {
    doh: {
      serverURL: 'https://dns.google/dns-query',
      serverName: 'dns.google',
      addrs: ['8.8.8.8', '8.8.4.4'],
      addrs6: ['2001:4860:4860::8888', '2001:4860:4860::8844'],
      description: 'Google DoH (8.8.8.8)',
    },
    dot: {
      serverName: 'dns.google',
      addrs: ['8.8.8.8', '8.8.4.4'],
      addrs6: ['2001:4860:4860::8888', '2001:4860:4860::8844'],
      description: 'Google DoT (8.8.8.8)',
    },
  },
  
  quad9: {
    doh: {
      serverURL: 'https://dns.quad9.net/dns-query',
      serverName: 'dns.quad9.net',
      addrs: ['9.9.9.9', '149.112.112.112'],
      addrs6: ['2620:fe::fe', '2620:fe::9'],
      description: 'Quad9 DoH (9.9.9.9)',
    },
    dot: {
      serverName: 'dns.quad9.net',
      addrs: ['9.9.9.9', '149.112.112.112'],
      addrs6: ['2620:fe::fe', '2620:fe::9'],
      description: 'Quad9 DoT (9.9.9.9)',
    },
  },
  
  nextdns: {
    make(profileId) {
      if (!profileId) throw new Error('NextDNS requires --nextdns-id=<id>');
      return {
        doh: {
          serverURL: `https://dns.nextdns.io/${profileId}`,
          serverName: 'dns.nextdns.io',
          addrs: ['45.90.28.0', '45.90.30.0'],
          addrs6: ['2a07:a8c0::', '2a07:a8c1::'],
          description: `NextDNS DoH (${profileId})`,
        },
        dot: {
          serverName: 'dns.nextdns.io',
          addrs: ['45.90.28.0', '45.90.30.0'],
          addrs6: ['2a07:a8c0::', '2a07:a8c1::'],
          description: `NextDNS DoT (${profileId})`,
        },
      };
    },
  },
  
  adguard: {
    doh: {
      serverURL: 'https://dns.adguard-dns.com/dns-query',
      serverName: 'dns.adguard-dns.com',
      addrs: ['94.140.14.14', '94.140.15.15'],
      addrs6: ['2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'],
      description: 'AdGuard DoH (Filtered)',
    },
    dot: {
      serverName: 'dns.adguard-dns.com',
      addrs: ['94.140.14.14', '94.140.15.15'],
      addrs6: ['2a10:50c0::ad1:ff', '2a10:50c0::ad2:ff'],
      description: 'AdGuard DoT (Filtered)',
    },
  },
  
  // Custom provider template will be created dynamically
};

////////////////////////////////////////////////////////////////////////////////
// Enhanced CLI Argument Parsing
////////////////////////////////////////////////////////////////////////////////

/**
 * Parse command line arguments with advanced functionality
 * @param {string[]} argv - Command line arguments array
 * @returns {Object} Parsed arguments object
 */
function parseArgs(argv) {
  const args = {};
  const aliases = {
    h: 'help',
    o: 'output',
    p: 'provider',
    i: 'nextdns-id',
    v: 'verbose',
    q: 'quiet',
    d: 'debug',
  };
  
  // First pass: collect raw args
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    
    // Handle help specially
    if (arg === '-h' || arg === '--help') {
      args.help = true;
      continue;
    }
    
    // Handle short options
    if (arg.startsWith('-') && !arg.startsWith('--')) {
      const shortOpt = arg.slice(1);
      if (aliases[shortOpt]) {
        args[aliases[shortOpt]] = true;
      }
      continue;
    }
    
    // Handle long options with values
    if (arg.startsWith('--')) {
      const [k, vRaw] = arg.slice(2).split('=');
      const key = k.toLowerCase();
      const value = vRaw === undefined ? true : vRaw;
      args[key] = value;
    }
  }
  
  return args;
}

/**
 * Displays help information for the script
 */
function showHelp() {
  console.log(`
DNS Configuration Profile Generator v${ENV.BUILD_VERSION}

USAGE:
  node ${path.basename(__filename)} [OPTIONS]

BASIC OPTIONS:
  -h, --help                Show this help message
  -o, --output=FILE         Output file path for the mobileconfig file
  -p, --provider=NAME       Specify a single provider (cloudflare, google, quad9, nextdns, adguard)
  --providers=LIST          Comma-separated list of providers
  --all                     Include all built-in providers
  
PROVIDER OPTIONS:
  -i, --nextdns-id=ID       NextDNS profile ID (required for NextDNS)
  --doh-url=URL             Custom DoH URL for custom provider
  --doh-host=HOST           Custom DoH hostname (defaults to URL hostname)
  --custom-name=NAME        Name for custom provider (default: "custom")
  --addrs=LIST              Comma-separated list of IPv4 addresses
  --addrs6=LIST             Comma-separated list of IPv6 addresses
  --domains=LIST            Comma-separated list of domains for supplemental match domains
  
PROFILE OPTIONS:
  --identifier-style=STYLE  Payload identifier style: default, infix, or flat
  --dot                     Add DoT (DNS over TLS) configurations
  --minimal                 Only include the first provider (DoH only)
  --split                   Generate individual profiles for each provider
  --profile-id=ID           Override base profile identifier
  --randomize               Use random UUIDs instead of deterministic ones
  --uuid-salt=STRING        Add a salt to the deterministic UUID generation
  --sign                    Sign the profile with specified identity
  --sign-identity=ID        Certificate identity to use for signing

OUTPUT OPTIONS:
  -q, --quiet               Suppress all non-error console output
  -v, --verbose             Show detailed information during generation
  -d, --debug               Show debug information including errors

EXAMPLES:
  node ${path.basename(__filename)} --provider cloudflare
  node ${path.basename(__filename)} --provider nextdns --nextdns-id=5619c1
  node ${path.basename(__filename)} --providers nextdns,cloudflare --nextdns-id=5619c1 --dot
  node ${path.basename(__filename)} --all --dot --randomize
  node ${path.basename(__filename)} --provider nextdns --nextdns-id=5619c1 --domains example.com
  
For more information, visit: https://github.com/PopduexRem/shadow-scripts
`);
}

////////////////////////////////////////////////////////////////////////////////
// Enhanced Utility Functions
////////////////////////////////////////////////////////////////////////////////

/**
 * Converts a UUID string to bytes
 * @param {string} u - UUID string
 * @returns {Buffer} Buffer containing UUID bytes
 */
function uuidToBytes(u) {
  return Buffer.from(u.replace(/-/g, ''), 'hex');
}

/**
 * Fallback UUID generation for older Node versions
 * @returns {string} Random UUID string
 */
function randomUUIDFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.randomBytes(1)[0] % 16;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a UUID, either deterministic or random
 * @param {string} name - Name to use for deterministic generation
 * @param {boolean} [randomize=false] - Whether to generate random UUID
 * @returns {string} UUID string
 */
function makeUUID(name, randomize = false) {
  const salt = ARGS['uuid-salt'] ? `:${ARGS['uuid-salt']}` : '';
  if (randomize || ARGS.randomize) {
    return crypto.randomUUID ? crypto.randomUUID() : randomUUIDFallback();
  }
  
  // Deterministic v5-like UUID generation
  const nsBytes = uuidToBytes(PROFILE_NAMESPACE);
  const nameBytes = Buffer.from(name + salt, 'utf8');
  const hash = crypto.createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  
  // Format according to v5 UUID spec
  hash[6] = (hash[6] & 0x0f) | 0x50; // Set version to 5
  hash[8] = (hash[8] & 0x3f) | 0x80; // Set variant to RFC4122
  
  const hex = hash.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Escape special XML characters
 * @param {string} str - String to escape
 * @returns {string} Escaped string
 */
function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Split a comma-separated list into an array
 * @param {string} val - Comma-separated string
 * @returns {string[]} Array of values
 */
function splitCommaList(val) {
  if (!val) return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * Validate IPv4 address format
 * @param {string} addr - IPv4 address to validate
 * @returns {boolean} Whether address is valid
 */
function isValidIPv4(addr) {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(addr)) return false;
  return addr.split('.').every(octet => {
    const num = parseInt(octet, 10);
    return !isNaN(num) && num >= 0 && num <= 255;
  });
}

/**
 * Validate IPv6 address format
 * @param {string} addr - IPv6 address to validate
 * @returns {boolean} Whether address is valid
 */
function isValidIPv6(addr) {
  // More comprehensive IPv6 validation
  if (!addr || typeof addr !== 'string') return false;
  
  // Quick format check before detailed validation
  if (!/^[0-9a-f:]+$/i.test(addr)) return false;
  if (!addr.includes(':')) return false;
  
  // Check for too many colons or double colons
  const colonCount = (addr.match(/:/g) || []).length;
  if (colonCount > 7) return false;
  
  // Check for multiple double colons
  const doubleColonCount = (addr.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;
  
  // Basic structure check passed
  return true;
}

/**
 * Validate DNS hostname
 * @param {string} hostname - Hostname to validate
 * @returns {boolean} Whether hostname is valid
 */
function isValidHostname(hostname) {
  if (!hostname || typeof hostname !== 'string') return false;
  
  // RFC 1123 hostname validation
  const pattern = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;
  return pattern.test(hostname);
}

/**
 * Validate a URL string
 * @param {string} url - URL to validate
 * @returns {boolean} Whether URL is valid
 */
function isValidURL(url) {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validate DNS provider specification
 * @param {Object} spec - Provider specification
 * @param {Object} options - Validation options
 * @throws {Error} If validation fails
 */
function validateSpec(spec, { requireURL = true } = {}) {
  // Require serverURL for DoH
  if (requireURL && !spec.serverURL) {
    throw new Error('Missing serverURL for DoH spec');
  }
  
  if (requireURL && !isValidURL(spec.serverURL)) {
    throw new Error(`Invalid serverURL: ${spec.serverURL}`);
  }
  
  // Require serverName
  if (!spec.serverName) {
    throw new Error('Missing serverName');
  }
  
  if (!isValidHostname(spec.serverName)) {
    throw new Error(`Invalid serverName: ${spec.serverName}`);
  }
  
  // Require at least one IPv4 address
  if (!Array.isArray(spec.addrs) || spec.addrs.length === 0) {
    throw new Error('No IPv4 addresses provided');
  }
  
  // Validate each IPv4 address
  spec.addrs.forEach(addr => {
    if (!isValidIPv4(addr)) {
      throw new Error(`Invalid IPv4 address: ${addr}`);
    }
  });
  
  // Validate IPv6 addresses if present
  if (spec.addrs6 && Array.isArray(spec.addrs6)) {
    spec.addrs6.forEach(addr => {
      if (!isValidIPv6(addr)) {
        throw new Error(`Invalid IPv6 address: ${addr}`);
      }
    });
  }
  
  // Validate supplemental match domains if present
  if (spec.supplementalMatchDomains && Array.isArray(spec.supplementalMatchDomains)) {
    spec.supplementalMatchDomains.forEach(domain => {
      if (!isValidHostname(domain)) {
        throw new Error(`Invalid domain: ${domain}`);
      }
    });
  }
}

/**
 * Format file size in human-readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size
 */
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Create a logger with verbose and quiet options
 * @returns {Object} Logger object
 */
function createLogger() {
  const isQuiet = !!ARGS.quiet;
  const isVerbose = !!ARGS.verbose;
  const isDebug = !!ARGS.debug;
  
  return {
    info: (message) => {
      if (!isQuiet) console.log(message);
    },
    success: (message) => {
      if (!isQuiet) console.log(`✅ ${message}`);
    },
    warn: (message) => {
      if (!isQuiet) console.warn(`⚠️ ${message}`);
    },
    error: (message) => {
      console.error(`❌ ${message}`);
    },
    debug: (message) => {
      if (isDebug) console.log(`🔍 ${message}`);
    },
    verbose: (message) => {
      if (isVerbose && !isQuiet) console.log(`  ${message}`);
    },
    table: (data) => {
      if (!isQuiet) console.table(data);
    }
  };
}

////////////////////////////////////////////////////////////////////////////////
// Identifier Style Handling
////////////////////////////////////////////////////////////////////////////////

/**
 * Build payload identifier based on selected style
 * @param {string} baseProfileId - Base profile ID
 * @param {string} provider - Provider name
 * @param {string} flavor - Protocol flavor (doh/dot)
 * @param {string} protocolTag - Protocol tag (https/tls)
 * @param {string} style - Identifier style
 * @returns {string} Formatted payload identifier
 */
function buildPayloadIdentifier(baseProfileId, provider, flavor, protocolTag, style) {
  // Sanitize provider name
  provider = provider.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  
  // Apply identifier style formatting
  switch (style) {
    case 'infix':
      // com.base.shadow.<provider>.dns.<flavor>.<protocolTag>
      return `${baseProfileId.replace(/\.dns$/, '')}.${provider}.dns.${flavor}.${protocolTag}`;
    case 'flat':
      // com.base.shadow.<provider>.<flavor>
      return `${baseProfileId.replace(/\.dns$/, '')}.${provider}.${flavor}`;
    case 'default':
    default:
      // Original enhanced style
      return `${baseProfileId}.${provider}-${flavor}.${protocolTag}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Provider Resolution
////////////////////////////////////////////////////////////////////////////////

/**
 * Resolve requested DNS providers from arguments
 * @returns {string[]} Array of provider names
 */
function resolveProviders() {
  const logger = createLogger();
  const list = [];
  
  // Handle provider selection options
  if (ARGS.all) {
    list.push('cloudflare', 'google', 'quad9', 'adguard');
    logger.debug('Using all built-in providers');
  } else if (ARGS.providers) {
    splitCommaList(ARGS.providers).forEach(p => list.push(p.toLowerCase()));
    logger.debug(`Using specified providers: ${ARGS.providers}`);
  } else if (ARGS.provider) {
    list.push(String(ARGS.provider).toLowerCase());
    logger.debug(`Using single provider: ${ARGS.provider}`);
  } else {
    list.push(...DEFAULT_PROVIDERS);
    logger.debug(`Using default provider(s): ${DEFAULT_PROVIDERS.join(', ')}`);
  }

  // Handle custom provider if URL specified
  if (ARGS['doh-url']) {
    const name = (ARGS['custom-name'] || 'custom').toLowerCase();
    list.push(name);
    
    try {
      const serverName = ARGS['doh-host'] || new URL(ARGS['doh-url']).hostname;
      const addrs = splitCommaList(ARGS.addrs).length ? splitCommaList(ARGS.addrs) : ['1.1.1.1'];
      const addrs6 = splitCommaList(ARGS.addrs6);
      const supplementalMatchDomains = splitCommaList(ARGS.domains);
      
      PROVIDER_PRESETS[name] = {
        doh: {
          serverURL: ARGS['doh-url'],
          serverName,
          addrs,
          addrs6,
          supplementalMatchDomains,
          description: `Custom DoH (${name})`,
        },
        dot: {
          serverName,
          addrs,
          addrs6,
          supplementalMatchDomains,
          description: `Custom DoT (${name})`,
        },
      };
      
      logger.debug(`Created custom provider '${name}' with URL: ${ARGS['doh-url']}`);
    } catch (error) {
      throw new Error(`Failed to create custom provider: ${error.message}`);
    }
  }

  // Configure NextDNS if selected
  if (list.includes('nextdns')) {
    const id = ARGS['nextdns-id'] || process.env.NEXTDNS_ID;
    logger.debug(`Using NextDNS with profile ID: ${id || 'MISSING'}`);
    
    try {
      PROVIDER_PRESETS.nextdns = PROVIDER_PRESETS.nextdns.make(id);
      
      // Override addresses if specified
      if (ARGS.addrs) {
        const addrs = splitCommaList(ARGS.addrs);
        if (addrs.length) {
          if (PROVIDER_PRESETS.nextdns.doh) PROVIDER_PRESETS.nextdns.doh.addrs = addrs;
          if (PROVIDER_PRESETS.nextdns.dot) PROVIDER_PRESETS.nextdns.dot.addrs = addrs;
          logger.debug(`Custom IPv4 addresses for NextDNS: ${addrs.join(', ')}`);
        }
      }
      
      // Override IPv6 addresses if specified
      if (ARGS.addrs6) {
        const addrs6 = splitCommaList(ARGS.addrs6);
        if (PROVIDER_PRESETS.nextdns.doh) PROVIDER_PRESETS.nextdns.doh.addrs6 = addrs6;
        if (PROVIDER_PRESETS.nextdns.dot) PROVIDER_PRESETS.nextdns.dot.addrs6 = addrs6;
        logger.debug(`Custom IPv6 addresses for NextDNS: ${addrs6.join(', ')}`);
      }
      
      // Add supplemental domains if specified
      if (ARGS.domains) {
        const domains = splitCommaList(ARGS.domains);
        if (PROVIDER_PRESETS.nextdns.doh) {
          PROVIDER_PRESETS.nextdns.doh.supplementalMatchDomains = domains;
        }
        if (PROVIDER_PRESETS.nextdns.dot) {
          PROVIDER_PRESETS.nextdns.dot.supplementalMatchDomains = domains;
        }
        logger.debug(`Added domain matching for NextDNS: ${domains.join(', ')}`);
      }
    } catch (error) {
      throw new Error(`NextDNS configuration failed: ${error.message}`);
    }
  }

  // Validate all providers exist
  const final = list.map(provider => {
    if (!PROVIDER_PRESETS[provider]) {
      throw new Error(`Unknown provider: ${provider}`);
    }
    return provider;
  });

  // Remove duplicates
  return Array.from(new Set(final));
}

////////////////////////////////////////////////////////////////////////////////
// Payload Builders
////////////////////////////////////////////////////////////////////////////////

/**
 * Build DNS payload for a specific provider and protocol
 * @param {Object} spec - Provider specification
 * @param {string} protocol - Protocol (HTTPS/TLS)
 * @param {string} providerName - Provider name
 * @param {string} flavor - Protocol flavor (doh/dot)
 * @param {string} identifierStyle - Identifier style
 * @returns {string} XML payload
 */
function buildDnsPayload(spec, protocol, providerName, flavor, identifierStyle) {
  // Extract configuration
  const { serverURL, serverName, addrs = [], addrs6 = [], description, supplementalMatchDomains = [] } = spec;
  const requireURL = protocol === 'HTTPS';
  
  // Validate configuration
  validateSpec(spec, { requireURL });

  // Generate identifiers
  const protocolTag = protocol === 'HTTPS' ? 'https' : 'tls';
  const payloadUUID = makeUUID(`${protocol}:${providerName}:${flavor}:${serverName}:${protocolTag}`);
  const payloadIdentifier = buildPayloadIdentifier(
    ENV.PROFILE_ID,
    providerName,
    flavor,
    protocolTag,
    identifierStyle
  );

  // Create display name
  const displayName = `${ENV.DISPLAY} • ${protocol} • ${description || `${providerName} ${flavor}`}`.trim();

  // Generate server addresses XML
  const ipv4XML = addrs.map(a => `<string>${xmlEscape(a)}</string>`).join('');
  const ipv6XML = (addrs6 || []).map(a => `<string>${xmlEscape(a)}</string>`).join('');
  const addressXML = ipv4XML + ipv6XML;

  // Generate supplemental domains XML if present
  let supplementalDomainsXML = '';
  if (supplementalMatchDomains && supplementalMatchDomains.length > 0) {
    supplementalDomainsXML = `
        <key>SupplementalMatchDomains</key>
        <array>${supplementalMatchDomains.map(d => `<string>${xmlEscape(d)}</string>`).join('')}</array>`;
  }

  // Generate server URL XML if needed (DoH only)
  const serverURLXML = protocol === 'HTTPS'
    ? `<key>ServerURL</key><string>${xmlEscape(serverURL)}</string>`
    : '';

  // Build complete payload
  return `
    <dict>
      <key>PayloadType</key><string>com.apple.dnsSettings.managed</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>${xmlEscape(payloadIdentifier)}</string>
      <key>PayloadUUID</key><string>${payloadUUID}</string>
      <key>PayloadDisplayName</key><string>${xmlEscape(displayName)}</string>
      <key>PayloadOrganization</key><string>${xmlEscape(ENV.ORG)}</string>
      <key>PayloadDescription</key><string>${xmlEscape(`${protocol} secure DNS configuration for ${providerName}`)}</string>
      <key>ProhibitDisablement</key><false/>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key><string>${protocol}</string>
        ${serverURLXML}
        <key>ServerName</key><string>${xmlEscape(serverName)}</string>
        <key>ServerAddresses</key>
        <array>${addressXML}</array>${supplementalDomainsXML}
      </dict>
    </dict>`;
}

/**
 * Build complete plist document
 * @param {string[]} payloadsXML - Array of XML payloads
 * @param {string} identifierStyle - Identifier style
 * @returns {string} Complete plist XML
 */
function buildPlist(payloadsXML, identifierStyle) {
  // Generate root UUID
  const rootUUID = makeUUID(`profile-root:${identifierStyle}`);
  
  // Handle expiration if provided
  const expiryDate = ARGS.expiry ? new Date(ARGS.expiry) : null;
  const expiryXML = expiryDate && !isNaN(expiryDate.getTime()) ? 
    `<key>PayloadExpirationDate</key><date>${expiryDate.toISOString().replace(/\.\d+Z$/, 'Z')}</date>` : '';
  
  // Handle removal disallowed
  const removalDisallowed = ARGS['disallow-removal'] === 'true' ? 'true' : 'false';
  
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>${xmlEscape(ENV.PROFILE_ID)}</string>
  <key>PayloadUUID</key><string>${rootUUID}</string>
  <key>PayloadDisplayName</key><string>${xmlEscape(ENV.DISPLAY)}</string>
  <key>PayloadOrganization</key><string>${xmlEscape(ENV.ORG)}</string>
  <key>PayloadDescription</key>
  <string>${xmlEscape(`${ENV.DESCRIPTION}. Generated ${new Date().toISOString()} (style=${identifierStyle}).`)}</string>
  ${expiryXML}
  <key>PayloadRemovalDisallowed</key><${removalDisallowed}/>
  <key>PayloadContent</key>
  <array>
    ${payloadsXML.join('\n')}
  </array>
</dict></plist>
`;
}

/**
 * Sign profile with Apple CMS if requested
 * @param {string} plist - Profile content
 * @returns {Buffer|string} Signed or original content
 */
function signProfile(plist) {
  const signEnabled = ARGS.sign || ENV.SIGN_ENABLED;
  const logger = createLogger();
  
  if (!signEnabled) {
    logger.debug('Signing not requested, returning unsigned profile');
    return plist;
  }

  const { execSync } = require('child_process');
  const tempFile = path.join(os.tmpdir(), `profile_${Date.now()}.unsigned.mobileconfig`);
  const outputFile = path.join(os.tmpdir(), `profile_${Date.now()}.signed.mobileconfig`);
  
  try {
    // Get signing identity
    const identity = ARGS['sign-identity'] || ENV.SIGN_IDENTITY;
    if (!identity) {
      logger.warn('Signing requested but no identity provided, returning unsigned profile');
      return plist;
    }
    
    // Write unsigned profile to temporary file
    fs.writeFileSync(tempFile, plist);
    logger.debug(`Temporary unsigned profile written to: ${tempFile}`);
    
    // Sign using macOS security command
    logger.debug(`Signing profile with identity: ${identity}`);
    execSync(`security cms -S -i "${tempFile}" -o "${outputFile}" -k "${identity}"`, {
      stdio: ARGS.debug ? 'inherit' : 'pipe'
    });
    
    // Read signed content
    const signedContent = fs.readFileSync(outputFile);
    logger.success(`Profile signed successfully with identity: ${identity}`);
    
    return signedContent;
  } catch (e) {
    logger.error(`Signing failed: ${e.message}`);
    logger.warn('Falling back to unsigned profile');
    return plist;
  } finally {
    // Clean up temporary files
    try {
      if (fs.existsSync(tempFile)) fs.unlinkSync(tempFile);
      if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
      logger.debug('Temporary files cleaned up');
    } catch (e) {
      logger.debug(`Error cleaning temporary files: ${e.message}`);
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Main Execution
////////////////////////////////////////////////////////////////////////////////

/**
 * Main execution function
 */
function main() {
  const logger = createLogger();
  
  // Handle help request
  if (ARGS.help) {
    showHelp();
    return;
  }

  // Start timer for performance measurement
  const startTime = process.hrtime();
  
  try {
    // Resolve providers from arguments
    const providers = resolveProviders();
    logger.verbose(`Selected providers: ${providers.join(', ')}`);
    
    // Get identifier style
    const style = (ARGS['identifier-style'] || 'default').toLowerCase();
    if (!['default', 'infix', 'flat'].includes(style)) {
      throw new Error('Invalid --identifier-style (use default|infix|flat)');
    }
    logger.verbose(`Using identifier style: ${style}`);

    // Override profile ID if specified
    if (ARGS['profile-id']) {
      ENV.PROFILE_ID = ARGS['profile-id'];
      logger.verbose(`Using custom profile ID: ${ENV.PROFILE_ID}`);
    }

    // Configure generation options
    const wantDoT = !!ARGS.dot;
    const minimal = !!ARGS.minimal;
    const split = !!ARGS.split;
    const payloadsAll = [];
    
    // Apply domains to all providers if specified
    const globalDomains = splitCommaList(ARGS.domains);
    if (globalDomains.length > 0) {
      logger.verbose(`Adding supplemental match domains to all providers: ${globalDomains.join(', ')}`);
      
      providers.forEach(providerName => {
        const spec = PROVIDER_PRESETS[providerName];
        if (spec.doh) {
          spec.doh.supplementalMatchDomains = [
            ...(spec.doh.supplementalMatchDomains || []),
            ...globalDomains
          ];
        }
        if (spec.dot) {
          spec.dot.supplementalMatchDomains = [
            ...(spec.dot.supplementalMatchDomains || []),
            ...globalDomains
          ];
        }
      });
    }

    // Select providers based on minimal mode
    const selectedProviders = minimal ? providers.slice(0, 1) : providers;
    logger.debug(`Processing providers: ${selectedProviders.join(', ')}`);

    // Generate payloads for each provider
    selectedProviders.forEach(providerName => {
      const spec = PROVIDER_PRESETS[providerName];
      const dohSpec = spec.doh || spec;
      const dotSpec = spec.dot;

      if (dohSpec) {
        logger.debug(`Building DoH payload for ${providerName}`);
        payloadsAll.push(
          buildDnsPayload(dohSpec, 'HTTPS', providerName, 'doh', style)
        );
      }
      
      if (!minimal && wantDoT && dotSpec) {
        logger.debug(`Building DoT payload for ${providerName}`);
        payloadsAll.push(
          buildDnsPayload(dotSpec, 'TLS', providerName, 'dot', style)
        );
      }
    });

    if (payloadsAll.length === 0) {
      throw new Error('No payloads were generated');
    }
    
    logger.debug(`Generated ${payloadsAll.length} total payloads`);

    // Generate and write the aggregate profile
    const aggregatePlist = buildPlist(payloadsAll, style);
    const output = ARGS.output || ENV.OUTPUT;
    
    // Sign the profile if requested
    const finalContent = signProfile(aggregatePlist);
    
    // Ensure output directory exists
    fs.mkdirSync(path.dirname(output), { recursive: true });
    
    // Write profile to file
    fs.writeFileSync(output, finalContent);
    logger.debug(`Profile written to: ${output}`);

    // Generate split profiles if requested
    if (split && providers.length > 1) {
      logger.debug('Generating split profiles for each provider');
      
      providers.forEach(providerName => {
        const spec = PROVIDER_PRESETS[providerName];
        const providerPayloads = [];
        
        if (spec.doh) {
          providerPayloads.push(
            buildDnsPayload(spec.doh, 'HTTPS', providerName, 'doh', style)
          );
        }
        
        if (wantDoT && spec.dot) {
          providerPayloads.push(
            buildDnsPayload(spec.dot, 'TLS', providerName, 'dot', style)
          );
        }
        
        if (providerPayloads.length === 0) return;
        
        const plist = buildPlist(providerPayloads, style);
        const signedPlist = signProfile(plist);
        const fileName = output.replace(/\.mobileconfig$/, `.${providerName}.mobileconfig`);
        
        fs.writeFileSync(fileName, signedPlist);
        logger.verbose(`Split profile written: ${fileName}`);
      });
    }

    // Calculate metrics
    const hash = crypto.createHash('sha256').update(
      Buffer.isBuffer(finalContent) ? finalContent : Buffer.from(finalContent)
    ).digest('hex');
    const size = Buffer.byteLength(finalContent);
    const elapsedTime = process.hrtime(startTime);
    const elapsedMs = Math.round((elapsedTime[0] * 1e9 + elapsedTime[1]) / 1e6);

    // Output results summary
    logger.success(`DNS profile generated in ${elapsedMs}ms`);
    logger.info('');
    logger.info('Profile Details:');
    logger.info(`  File:        ${output}`);
    logger.info(`  Providers:   ${selectedProviders.join(', ')}`);
    logger.info(`  Payloads:    ${payloadsAll.length}`);
    logger.info(`  DoT included: ${wantDoT && !minimal ? 'Yes' : 'No'}`);
    logger.info(`  Style:       ${style}`);
    logger.info(`  Size:        ${formatFileSize(size)}`);
    logger.info(`  SHA256:      ${hash}`);
    logger.info('');
    
    if (split && providers.length > 1) {
      logger.info(`Split profiles: ${providers.length} individual files generated`);
    }
    
    // Extra info
    logger.info('Installation: Open the .mobileconfig file, then approve in Settings > General > VPN & Device Management.');
    if (!ARGS.randomize) {
      logger.verbose('Note: Using deterministic UUIDs (add --randomize for fresh UUIDs per run)');
    }
  } catch (e) {
    logger.error(`Generation failed: ${e.message}`);
    if (ARGS.debug) logger.debug(e.stack);
    process.exit(1);
  }
}

// Parse command line arguments
const ARGS = parseArgs(process.argv);

// Run main if directly invoked
if (require.main === module) {
  main();
}

// Export API for programmatic usage
module.exports = {
  parseArgs,
  resolveProviders,
  buildDnsPayload,
  buildPlist,
  buildPayloadIdentifier,
  makeUUID,
  signProfile,
  validateSpec,
  isValidIPv4,
  isValidIPv6,
  isValidHostname,
  main,
};
