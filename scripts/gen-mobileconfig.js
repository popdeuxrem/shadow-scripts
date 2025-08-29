/**
 * scripts/gen-mobileconfig.js
 *
 * Regenerated DNS over HTTPS / TLS profile generator with flexible identifier styles.
 *
 * Enhancements vs previous version:
 *  - --identifier-style (default|infix|flat)
 *  - IPv6 addresses via --addrs6
 *  - --split to emit per-provider profiles plus an aggregate (optional)
 *  - --minimal to produce only the first provider DoH payload
 *  - --quiet to suppress console summary except errors
 *  - Deterministic UUID derivation can now add a salt (--uuid-salt)
 *  - Provider-specific payload labels made uniform
 *
 * Example commands:
 *  node scripts/gen-mobileconfig.js --provider nextdns --nextdns-id=5619c1
 *  node scripts/gen-mobileconfig.js --providers nextdns,cloudflare --nextdns-id=5619c1 --dot --identifier-style=infix
 *  node scripts/gen-mobileconfig.js --all --dot --randomize
 *  node scripts/gen-mobileconfig.js --provider nextdns --nextdns-id=5619c1 --addrs 45.90.28.0,45.90.30.0 --addrs6 2a07:a8c0::,2a07:a8c1:: --output ./dist/nextdns.mobileconfig
 *
 * Identifier styles:
 *  default: com.popdeuxrem.shadow.dns.<provider-suffix>.<protocol-tag>
 *  infix:   com.popdeuxrem.shadow.<provider>.<dns>.{doh|dot}.{https|tls}
 *  flat:    com.popdeuxrem.shadow.<provider>.{doh|dot}
 *
 * Note: Actual Apple payload acceptance depends only on uniqueness; style is cosmetic/organizational.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

////////////////////////////////////////////////////////////////////////////////
// Environment / Defaults
////////////////////////////////////////////////////////////////////////////////

const ENV = {
  ORG: process.env.DNS_ORG || 'popdeuxrem',
  DISPLAY: process.env.DNS_DISPLAY || 'Shadow-Scripts • Secure DNS',
  OUTPUT: process.env.DNS_OUTPUT || path.resolve(__dirname, '../apps/loader/public/configs/shadow_doh.mobileconfig'),
  PROFILE_ID: process.env.DNS_PROFILE_ID || 'com.popdeuxrem.shadow.dns',
};

const DEFAULT_PROVIDERS = ['cloudflare'];
const PROFILE_NAMESPACE = '0f0fdc57-dc5d-5c4b-9e02-77c683d4c9a1'; // namespace seed (arbitrary stable UUID)

const PROVIDER_PRESETS = {
  cloudflare: {
    doh: {
      serverURL: 'https://cloudflare-dns.com/dns-query',
      serverName: 'cloudflare-dns.com',
      addrs: ['1.1.1.1', '1.0.0.1'],
      description: 'Cloudflare DoH (1.1.1.1)',
    },
    dot: {
      serverName: 'cloudflare-dns.com',
      addrs: ['1.1.1.1', '1.0.0.1'],
      description: 'Cloudflare DoT (1.1.1.1)',
    },
  },
  google: {
    doh: {
      serverURL: 'https://dns.google/dns-query',
      serverName: 'dns.google',
      addrs: ['8.8.8.8', '8.8.4.4'],
      description: 'Google DoH (8.8.8.8)',
    },
    dot: {
      serverName: 'dns.google',
      addrs: ['8.8.8.8', '8.8.4.4'],
      description: 'Google DoT (8.8.8.8)',
    },
  },
  quad9: {
    doh: {
      serverURL: 'https://dns.quad9.net/dns-query',
      serverName: 'dns.quad9.net',
      addrs: ['9.9.9.9', '149.112.112.112'],
      description: 'Quad9 DoH (9.9.9.9)',
    },
    dot: {
      serverName: 'dns.quad9.net',
      addrs: ['9.9.9.9', '149.112.112.112'],
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
          description: `NextDNS DoH (${profileId})`,
        },
        dot: {
          serverName: 'dns.nextdns.io',
          addrs: ['45.90.28.0', '45.90.30.0'],
          description: `NextDNS DoT (${profileId})`,
        },
      };
    },
  },
};

////////////////////////////////////////////////////////////////////////////////
// CLI Parsing
////////////////////////////////////////////////////////////////////////////////

function parseArgs(argv) {
  const args = {};
  argv.slice(2).forEach(arg => {
    if (!arg.startsWith('--')) return;
    const [k, vRaw] = arg.replace(/^--/, '').split('=');
    const v = vRaw === undefined ? true : vRaw;
    args[k] = v;
  });
  return args;
}
const ARGS = parseArgs(process.argv);

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////

function uuidToBytes(u) {
  return Buffer.from(u.replace(/-/g, ''), 'hex');
}

function randomUUIDFallback() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = crypto.randomBytes(1)[0] % 16;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function makeUUID(name, randomize = false) {
  const salt = ARGS['uuid-salt'] ? `:${ARGS['uuid-salt']}` : '';
  if (randomize || ARGS.randomize) {
    return crypto.randomUUID ? crypto.randomUUID() : randomUUIDFallback();
  }
  // Deterministic v5-like
  const nsBytes = uuidToBytes(PROFILE_NAMESPACE);
  const nameBytes = Buffer.from(name + salt, 'utf8');
  const hash = crypto.createHash('sha1').update(Buffer.concat([nsBytes, nameBytes])).digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.toString('hex').slice(0, 32);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function splitCommaList(val) {
  if (!val) return [];
  return val.split(',').map(s => s.trim()).filter(Boolean);
}

function isValidIPv4(a) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(a) && a.split('.').every(o => +o >= 0 && +o <= 255);
}
function isValidIPv6(a) {
  // Simplistic check; Apple will further validate.
  return /^[0-9a-f:]+$/i.test(a) && a.includes(':');
}

function validateSpec(spec, { requireURL = true } = {}) {
  if (requireURL && !spec.serverURL) throw new Error('Missing serverURL for DoH spec');
  if (!spec.serverName) throw new Error('Missing serverName');
  if (!Array.isArray(spec.addrs) || spec.addrs.length === 0) throw new Error('No IPv4 addresses');
  spec.addrs.forEach(a => {
    if (!isValidIPv4(a)) throw new Error(`Invalid IPv4: ${a}`);
  });
  if (spec.addrs6) {
    spec.addrs6.forEach(a => {
      if (!isValidIPv6(a)) throw new Error(`Invalid IPv6: ${a}`);
    });
  }
}

////////////////////////////////////////////////////////////////////////////////
// Identifier style handling
////////////////////////////////////////////////////////////////////////////////

function buildPayloadIdentifier(baseProfileId, provider, flavor, protocolTag, style) {
  // flavor = doh | dot
  // protocolTag = https | tls (just descriptive)
  provider = provider.replace(/[^a-z0-9]+/gi, '').toLowerCase();
  switch (style) {
    case 'infix':
      // com.base.shadow.<provider>.dns.<flavor>.<protocolTag>
      return `${baseProfileId.replace(/\.dns$/, '')}.${provider}.dns.${flavor}.${protocolTag}`;
    case 'flat':
      // com.base.shadow.<provider>.<flavor>
      return `${baseProfileId.replace(/\.dns$/, '')}.${provider}.${flavor}`;
    case 'default':
    default:
      // original enhanced style
      return `${baseProfileId}.${provider}-${flavor}.${protocolTag}`;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Provider Resolution
////////////////////////////////////////////////////////////////////////////////

function resolveProviders() {
  const list = [];
  if (ARGS.all) {
    list.push('cloudflare', 'google', 'quad9');
  } else if (ARGS.providers) {
    splitCommaList(ARGS.providers).forEach(p => list.push(p.toLowerCase()));
  } else if (ARGS.provider) {
    list.push(String(ARGS.provider).toLowerCase());
  } else {
    list.push(...DEFAULT_PROVIDERS);
  }

  if (ARGS['doh-url']) {
    const name = (ARGS['custom-name'] || 'custom').toLowerCase();
    list.push(name);
    PROVIDER_PRESETS[name] = {
      doh: {
        serverURL: ARGS['doh-url'],
        serverName: ARGS['doh-host'] || new URL(ARGS['doh-url']).hostname,
        addrs: splitCommaList(ARGS.addrs).length ? splitCommaList(ARGS.addrs) : ['1.1.1.1'],
        addrs6: splitCommaList(ARGS.addrs6),
        description: `Custom DoH (${name})`,
      },
      dot: {
        serverName: ARGS['doh-host'] || new URL(ARGS['doh-url']).hostname,
        addrs: splitCommaList(ARGS.addrs).length ? splitCommaList(ARGS.addrs) : ['1.1.1.1'],
        addrs6: splitCommaList(ARGS.addrs6),
        description: `Custom DoT (${name})`,
      },
    };
  }

  if (list.includes('nextdns')) {
    const id = ARGS['nextdns-id'] || process.env.NEXTDNS_ID;
    PROVIDER_PRESETS.nextdns = PROVIDER_PRESETS.nextdns.make(id);
    // Allow overriding addresses via --addrs if only nextdns selected with custom addresses
    if (ARGS.addrs) {
      const addrs = splitCommaList(ARGS.addrs);
      if (addrs.length) {
        if (PROVIDER_PRESETS.nextdns.doh) PROVIDER_PRESETS.nextdns.doh.addrs = addrs;
        if (PROVIDER_PRESETS.nextdns.dot) PROVIDER_PRESETS.nextdns.dot.addrs = addrs;
      }
    }
    if (ARGS.addrs6) {
      const addrs6 = splitCommaList(ARGS.addrs6);
      if (PROVIDER_PRESETS.nextdns.doh) PROVIDER_PRESETS.nextdns.doh.addrs6 = addrs6;
      if (PROVIDER_PRESETS.nextdns.dot) PROVIDER_PRESETS.nextdns.dot.addrs6 = addrs6;
    }
  }

  const final = list.map(p => {
    if (!PROVIDER_PRESETS[p]) throw new Error(`Unknown provider: ${p}`);
    return p;
  });

  return Array.from(new Set(final));
}

////////////////////////////////////////////////////////////////////////////////
// Payload Builders
////////////////////////////////////////////////////////////////////////////////

function buildDnsPayload(spec, protocol, providerName, flavor, identifierStyle) {
  const { serverURL, serverName, addrs = [], addrs6 = [], description } = spec;
  const requireURL = protocol === 'HTTPS';
  validateSpec(spec, { requireURL });

  const protocolTag = protocol === 'HTTPS' ? 'https' : 'tls';
  const payloadUUID = makeUUID(`${protocol}:${providerName}:${flavor}:${serverName}:${protocolTag}`);
  const payloadIdentifier = buildPayloadIdentifier(
    ENV.PROFILE_ID,
    providerName,
    flavor,
    protocolTag,
    identifierStyle
  );

  const displayName =
    `${ENV.DISPLAY} • ${protocol} • ${description || `${providerName} ${flavor}`}`.trim();

  const ipv4XML = addrs.map(a => `<string>${xmlEscape(a)}</string>`).join('');
  const ipv6XML = addrs6.map(a => `<string>${xmlEscape(a)}</string>`).join('');
  const addressXML = ipv4XML + ipv6XML;

  const serverURLXML = protocol === 'HTTPS'
    ? `<key>ServerURL</key><string>${xmlEscape(serverURL)}</string>`
    : '';

  return `
    <dict>
      <key>PayloadType</key><string>com.apple.dnsSettings.managed</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>${xmlEscape(payloadIdentifier)}</string>
      <key>PayloadUUID</key><string>${payloadUUID}</string>
      <key>PayloadDisplayName</key><string>${xmlEscape(displayName)}</string>
      <key>PayloadOrganization</key><string>${xmlEscape(ENV.ORG)}</string>
      <key>ProhibitDisablement</key><false/>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key><string>${protocol}</string>
        ${serverURLXML}
        <key>ServerName</key><string>${xmlEscape(serverName)}</string>
        <key>ServerAddresses</key>
        <array>${addressXML}</array>
      </dict>
    </dict>`;
}

function buildPlist(payloadsXML, identifierStyle) {
  const rootUUID = makeUUID(`profile-root:${identifierStyle}`);
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
  <string>Installs DNS over HTTPS/TLS providers (no VPN payload). Generated ${new Date().toISOString()} (style=${identifierStyle}).</string>
  <key>PayloadContent</key>
  <array>
    ${payloadsXML.join('\n')}
  </array>
</dict></plist>
`;
}

// Placeholder for signing integration hook (currently passthrough).
function signProfile(plist) {
  // Implement CMS signing here if needed.
  return plist;
}

////////////////////////////////////////////////////////////////////////////////
// Main
////////////////////////////////////////////////////////////////////////////////

function main() {
  const providers = resolveProviders();
  const style = (ARGS['identifier-style'] || 'default').toLowerCase();
  if (!['default', 'infix', 'flat'].includes(style)) {
    throw new Error('Invalid --identifier-style (use default|infix|flat)');
  }

  if (ARGS['profile-id']) {
    ENV.PROFILE_ID = ARGS['profile-id'];
  }

  const wantDoT = !!ARGS.dot;
  const minimal = !!ARGS.minimal;
  const payloadsAll = [];
  const split = !!ARGS.split;

  const verbose = !ARGS.quiet;

  const selectedProviders = minimal ? providers.slice(0, 1) : providers;

  selectedProviders.forEach(providerName => {
    const spec = PROVIDER_PRESETS[providerName];
    const dohSpec = spec.doh || spec;
    const dotSpec = spec.dot;

    if (dohSpec) {
      payloadsAll.push(
        buildDnsPayload(dohSpec, 'HTTPS', providerName, 'doh', style)
      );
    }
    if (!minimal && wantDoT && dotSpec) {
      payloadsAll.push(
        buildDnsPayload(dotSpec, 'TLS', providerName, 'dot', style)
      );
    }
  });

  if (payloadsAll.length === 0) throw new Error('No payloads generated');

  // Aggregate file
  const aggregatePlist = signProfile(buildPlist(payloadsAll, style));
  const output = ARGS.output || ENV.OUTPUT;
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, aggregatePlist);

  if (split && providers.length > 1) {
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
      const plist = signProfile(buildPlist(providerPayloads, style));
      const fileName = output.replace(/\.mobileconfig$/, `.${providerName}.mobileconfig`);
      fs.writeFileSync(fileName, plist);
      if (verbose) {
        console.log(`Split profile written: ${fileName}`);
      }
    });
  }

  const hash = crypto.createHash('sha256').update(aggregatePlist).digest('hex');
  const size = Buffer.byteLength(aggregatePlist);

  if (verbose) {
    console.log('✅ DNS profile written');
    console.log('  File:        ', output);
    console.log('  Providers:   ', selectedProviders.join(', '));
    console.log('  DoT added:   ', wantDoT && !minimal);
    console.log('  Style:       ', style);
    console.log('  Minimal:     ', minimal);
    console.log('  Split files: ', split);
    console.log('  Randomize:   ', !!ARGS.randomize);
    console.log('  UUID Salt:   ', ARGS['uuid-salt'] || '(none)');
    console.log('  Size:        ', `${size} bytes`);
    console.log('  SHA256:      ', hash);
    console.log('\nInstall on iOS/macOS: open the .mobileconfig, then approve in Settings > General > VPN & Device Management.');
    if (!ARGS.randomize) {
        console.log('Note: Deterministic UUIDs used (add --randomize for fresh UUIDs per run).');
    }
  }
}

if (require.main === module) {
  try {
    main();
  } catch (e) {
    console.error('❌ Generation failed:', e.message);
    if (ARGS.debug) console.error(e.stack);
    process.exit(1);
  }
}

module.exports = {
  parseArgs,
  resolveProviders,
  buildDnsPayload,
  buildPlist,
  buildPayloadIdentifier,
  makeUUID,
  signProfile,
};
