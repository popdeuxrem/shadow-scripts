#!/usr/bin/env node
/**
 * scripts/gen-loon.js
 * -----------------------------------------------------------------------------
 * Advanced Loon config generator from a master-rules.yaml definition.
 *
 * Included Feature Set (can be toggled via flags):
 *  - Rich rule mapping: DOMAIN, DOMAIN-SUFFIX, DOMAIN-KEYWORD, IP-CIDR(+6),
 *    GEOIP, PROCESS-NAME, USER-AGENT, MATCH (converted to FINAL)
 *  - Category grouping comments derived from sections / tags
 *  - Variable substitution: ${VAR} from process.env plus --define k=v
 *  - --minify (strip blank/comment lines) / --annotate (add explanatory comments)
 *  - --split-rules writes split rule files (base, block, external, mitm)
 *  - --emit-json outputs a JSON descriptor alongside loon.conf
 *  - Deterministic CA filename derived from MITM hostname hash unless --ca-uuid provided
 *  - Optional --allow-sensitive gate for “sensitive” MITM hostnames (finance/banking/email)
 *  - Rule diff mode: --diff old.conf new.conf (shows adds/removes, no generation)
 *  - Prepend / append file blocks: --prepend pathA --append pathB (repeatable)
 *  - IPv4 / IPv6 DNS validation + warnings
 *  - Color output (auto when TTY; disable with --no-color)
 *  - Strict mode: fail on unknown rule shapes
 *  - Stats summary, SHA256
 *  - Dry run (--dry) to stdout
 *  - Help (--help)
 *
 * Basic Usage:
 *   node scripts/gen-loon.js
 *
 * Common Examples:
 *   node scripts/gen-loon.js --input configs/master-rules.yaml --output dist/loon.conf
 *   node scripts/gen-loon.js --dns 1.1.1.1,1.0.0.1,2606:4700:4700::1111 --emit-json
 *   node scripts/gen-loon.js --minify --split-rules
 *   node scripts/gen-loon.js --define REGION=US --define MODE=prod
 *   node scripts/gen-loon.js --no-mitm
 *   node scripts/gen-loon.js --allow-sensitive
 *   node scripts/gen-loon.js --diff old.conf new.conf
 *
 * Environment Vars:
 *   MASTER_RULES, DNS_SERVER, LOON_OUT_DIR, LOON_OUT_FILE, LOON_CA_UUID
 */

const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');

////////////////////////////////////////////////////////////////////////////////
// CLI
////////////////////////////////////////////////////////////////////////////////
function parseArgs(argv) {
  const args = { _: [] };
  argv.slice(2).forEach(a => {
    if (a.startsWith('--')) {
      const [k, vRaw] = a.slice(2).split('=');
      const kNorm = k.trim();
      if (vRaw === undefined) {
        // support repeated flags (prepend/append/define)
        if (['prepend','append','define'].includes(kNorm)) {
          args[kNorm] = args[kNorm] || [];
        } else {
          args[kNorm] = true;
        }
      } else {
        if (['prepend','append','define'].includes(kNorm)) {
          args[kNorm] = args[kNorm] || [];
          args[kNorm].push(vRaw);
        } else {
          args[kNorm] = vRaw;
        }
      }
    } else {
      args._.push(a);
    }
  });
  return args;
}
const ARGS = parseArgs(process.argv);

if (ARGS.help) {
  console.log(`
Usage: gen-loon [options]

Options:
  --input=FILE               Master rules YAML (default: $MASTER_RULES or configs/master-rules.yaml)
  --output=FILE              Output loon.conf
  --outdir=DIR               Output directory (if output not provided)
  --dns=LIST                 Comma list of DNS servers (IPv4/IPv6)
  --no-mitm                  Omit MITM section
  --allow-sensitive          Allow inclusion of sensitive MITM hostnames (finance/email)
  --mitm-skip-cert-check     Keep skip-server-cert-check=true (default)
  --strict                   Fail on unknown rule shapes
  --dry                      Print to stdout only
  --stats                    Print stats summary
  --minify                   Strip comments / extra blank lines
  --annotate                 Add explanatory comments
  --emit-json                Emit JSON descriptor (loon.conf.json)
  --split-rules              Emit rule fragments in a rules/ subfolder
  --define key=value         Inject variable(s) for ${VAR} substitution (repeatable)
  --prepend FILE             Prepend raw text block (repeatable)
  --append FILE              Append raw text block (repeatable)
  --ca-uuid UUID             Force CA UUID (otherwise deterministic hash)
  --reject-mode MODE         REJECT or REJECT-DROP (default REJECT)
  --diff old.conf new.conf   Show diff (added/removed rules) and exit
  --no-color                 Disable colored console
  --debug                    Show stack traces on error
  --help                     This help screen
`);
  process.exit(0);
}

////////////////////////////////////////////////////////////////////////////////
// Coloring
////////////////////////////////////////////////////////////////////////////////
const useColor = process.stdout.isTTY && !ARGS['no-color'];
const color = (c, s) => {
  if (!useColor) return s;
  const codes = {
    green: '\x1b[32m', red: '\x1b[31m', yellow: '\x1b[33m',
    cyan: '\x1b[36m', magenta: '\x1b[35m', gray: '\x1b[90m'
  };
  return (codes[c] || '') + s + '\x1b[0m';
};

////////////////////////////////////////////////////////////////////////////////
// Paths / Env
////////////////////////////////////////////////////////////////////////////////
const ROOT = path.resolve(__dirname, '..');
const INPUT = ARGS.input || process.env.MASTER_RULES || 'configs/master-rules.yaml';
const OUT_DIR = ARGS.outdir || process.env.LOON_OUT_DIR || path.join(ROOT, 'apps/loader/public/configs');
const OUT_FILE = ARGS.output || process.env.LOON_OUT_FILE || path.join(OUT_DIR, 'loon.conf');
const DNS_RAW = ARGS.dns || process.env.DNS_SERVER || '1.1.1.1';
const DNS_SERVERS = DNS_RAW.split(',').map(s => s.trim()).filter(Boolean);
const REJECT_MODE = (ARGS['reject-mode'] || 'REJECT').toUpperCase();
const INCLUDE_MITM = !ARGS['no-mitm'];
const MITM_SKIP_CERT_CHECK = ARGS['mitm-skip-cert-check'] === undefined ? true : ARGS['mitm-skip-cert-check'] !== 'false';
const STRICT = !!ARGS.strict;
const MINIFY = !!ARGS.minify;
const ANNOTATE = !!ARGS.annotate;
const SPLIT_RULES = !!ARGS['split-rules'];
const EMIT_JSON = !!ARGS['emit-json'];
const ALLOW_SENSITIVE = !!ARGS['allow-sensitive'];
const DRY = !!ARGS.dry;
const STATS = !!ARGS.stats;

////////////////////////////////////////////////////////////////////////////////
// Variable Substitution
////////////////////////////////////////////////////////////////////////////////
const DEFINE_MAP = {};
(ARGS.define || []).forEach(pair => {
  const idx = pair.indexOf('=');
  if (idx === -1) return;
  const k = pair.slice(0, idx).trim();
  const v = pair.slice(idx + 1);
  DEFINE_MAP[k] = v;
});

function substituteVars(str) {
  return String(str).replace(/\$\{([^}]+)\}/g, (_, key) => {
    if (key in DEFINE_MAP) return DEFINE_MAP[key];
    if (process.env[key] !== undefined) return process.env[key];
    return ''; // blank if missing
  });
}

////////////////////////////////////////////////////////////////////////////////
// YAML Loader w/ substitution
////////////////////////////////////////////////////////////////////////////////
function loadYAML(fp) {
  const raw = fs.readFileSync(fp, 'utf8');
  // Substitute before parsing (simple approach)
  const substituted = substituteVars(raw);
  return yaml.load(substituted);
}

////////////////////////////////////////////////////////////////////////////////
// Validation Helpers
////////////////////////////////////////////////////////////////////////////////
function isIPv4(a) {
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(a) && a.split('.').every(o => +o >= 0 && +o <= 255);
}
function isIPv6(a) {
  return /^[0-9a-f:]+$/i.test(a) && a.includes(':');
}
DNS_SERVERS.forEach(s => {
  if (!(isIPv4(s) || isIPv6(s))) {
    console.warn(color('yellow', `Warning: DNS server "${s}" not recognized as valid IPv4/IPv6`));
  }
});

////////////////////////////////////////////////////////////////////////////////
// Proxy Handling
////////////////////////////////////////////////////////////////////////////////
function normalizeProxy(p) {
  const copy = { ...p };
  copy.name = (copy.name || 'NONAME').replace(/\s+/g, '-');
  copy.type = (copy.type || 'socks5').toLowerCase();
  return copy;
}

function loonProxyLine(p) {
  const parts = [p.type, p.host, p.port].filter(Boolean);
  const opts = [];
  if (p.user) opts.push(`username=${p.user}`);
  if (p.pass) opts.push(`password=${p.pass}`);
  if (p.tls) opts.push('tls=true');
  if (p.servername) opts.push(`sni=${p.servername}`);
  if (p.ws) {
    opts.push('ws=true');
    if (p.ws_path) opts.push(`ws-path=${p.ws_path}`);
  }
  if (p.fast_open) opts.push('fast-open=true');
  return `${p.name} = ${parts.join(', ')}, ${opts.join(', ')}`.replace(/,\s*$/, '');
}

////////////////////////////////////////////////////////////////////////////////
// Rule Mapping
////////////////////////////////////////////////////////////////////////////////
const SUPPORTED_TYPES = new Set([
  'DOMAIN','DOMAIN-SUFFIX','DOMAIN-KEYWORD','IP-CIDR','IP-CIDR6',
  'GEOIP','PROCESS-NAME','USER-AGENT','MATCH','FINAL'
]);

function formatRule(r) {
  if (!r) return null;
  if (typeof r === 'string') {
    return r.trim();
  }
  if (typeof r !== 'object') {
    if (STRICT) throw new Error(`Unknown rule type: ${r}`);
    return null;
  }
  let { type, value, group } = r;
  if (!type) {
    if (STRICT) throw new Error(`Rule missing type: ${JSON.stringify(r)}`);
    return null;
  }
  type = type.toUpperCase();
  if (!SUPPORTED_TYPES.has(type) && STRICT) {
    throw new Error(`Unsupported rule type: ${type}`);
  }
  if (type === 'MATCH') return null; // will convert to FINAL fallback
  if (type === 'FINAL') return `FINAL, ${group || 'Proxy'}`;
  if (!value || !group) {
    if (STRICT) throw new Error(`Rule missing value/group: ${JSON.stringify(r)}`);
    return null;
  }
  // Normalize IP-CIDR6 to IP-CIDR6 line, Loon expects IP-CIDR6
  if (type === 'IP-CIDR6' || type === 'IP-CIDR') {
    return `${type}, ${value}, ${group}`;
  }
  return `${type}, ${value}, ${group}`;
}

////////////////////////////////////////////////////////////////////////////////
// External Rule Sets
////////////////////////////////////////////////////////////////////////////////
function inferRuleSetTag(url) {
  try {
    const base = url.split(/[?#]/)[0];
    const fname = base.split('/').pop();
    return fname.replace(/\.[^.]+$/, '');
  } catch {
    return 'ruleset';
  }
}

////////////////////////////////////////////////////////////////////////////////
// Category / Sensitivity
////////////////////////////////////////////////////////////////////////////////
const SENSITIVE_PATTERNS = /(bank|paypal|chase|wellsfargo|capitalone|boa|stripe|wise|alipay|venmo|americanexpress|icloud|gmail|proton|yahoo)/i;

function categorizeHostname(h) {
  if (/cloudflare|google|quad9|nextdns/i.test(h)) return 'DNS';
  if (/github|gitlab|vercel|heroku|digitalocean/i.test(h)) return 'Dev';
  if (/netflix|hulu|disney|primevideo|twitch|spotify|youtube/i.test(h)) return 'Streaming';
  if (/facebook|instagram|twitter|x\.com|reddit|tiktok|snap|telegram|discord/i.test(h)) return 'Social';
  if (/binance|coinbase|kraken|crypto|blockchain/i.test(h)) return 'Crypto';
  if (/apple|icloud/i.test(h)) return 'Apple';
  if (/mail|gmail|proton|yahoo/i.test(h)) return 'Mail';
  if (SENSITIVE_PATTERNS.test(h)) return 'Sensitive';
  return 'Other';
}

////////////////////////////////////////////////////////////////////////////////
// Deterministic CA (unless explicit)
////////////////////////////////////////////////////////////////////////////////
function deterministicCA(hostnames) {
  const sorted = [...hostnames].sort().join(',');
  return crypto.createHash('sha256').update(sorted).digest('hex').slice(0, 20).toUpperCase();
}

////////////////////////////////////////////////////////////////////////////////
// Prepend / Append Blocks
////////////////////////////////////////////////////////////////////////////////
function readBlocks(files = []) {
  const blocks = [];
  files.forEach(f => {
    try {
      blocks.push(fs.readFileSync(f, 'utf8').trimEnd());
    } catch (e) {
      console.warn(color('yellow', `Warning: could not read block file ${f}: ${e.message}`));
    }
  });
  return blocks;
}

////////////////////////////////////////////////////////////////////////////////
// Diff Mode
////////////////////////////////////////////////////////////////////////////////
if (ARGS.diff) {
  const idx = ARGS._;
  const parts = typeof ARGS.diff === 'string'
    ? [ARGS.diff, ...idx]
    : idx;
  if (parts.length < 2) {
    console.error('Need two files for --diff old.conf new.conf');
    process.exit(2);
  }
  const [oldFile, newFile] = parts.slice(0, 2);
  const oldContent = fs.existsSync(oldFile) ? fs.readFileSync(oldFile, 'utf8').split(/\r?\n/) : [];
  const newContent = fs.existsSync(newFile) ? fs.readFileSync(newFile, 'utf8').split(/\r?\n/) : [];
  const oldSet = new Set(oldContent);
  const newSet = new Set(newContent);
  const added = newContent.filter(l => !oldSet.has(l));
  const removed = oldContent.filter(l => !newSet.has(l));
  console.log(color('green', '--- Added ---'));
  added.forEach(l => console.log(color('green', '+ ' + l)));
  console.log(color('red', '--- Removed ---'));
  removed.forEach(l => console.log(color('red', '- ' + l)));
  console.log(`Summary: +${added.length}  -${removed.length}`);
  process.exit(0);
}

////////////////////////////////////////////////////////////////////////////////
// Build
////////////////////////////////////////////////////////////////////////////////
function build() {
  const doc = loadYAML(INPUT) || {};

  // Proxies
  const proxiesRaw = [];
  Object.values(doc.proxies || {}).forEach(arr => (arr || []).forEach(p => proxiesRaw.push(normalizeProxy(p))));
  const proxyMap = new Map();
  proxiesRaw.forEach(p => proxyMap.set(p.name, p)); // last wins
  const proxies = Array.from(proxyMap.values()).sort((a, b) => a.name.localeCompare(b.name));

  // Groups
  const groups = Object.entries(doc.groups || {}).map(([name, list]) => ({
    name,
    list: [...new Set((list || []).filter(Boolean))]
  }));

  // Rules
  const baseRuleLines = [];
  (doc.rules || []).forEach(r => {
    const line = formatRule(r);
    if (line) baseRuleLines.push(line);
  });

  // External rule sets
  const externalLines = [];
  (doc.external_rule_sets || []).forEach(e => {
    if (!e || !e.url || !e.group) return;
    const tag = e.tag || inferRuleSetTag(e.url);
    externalLines.push(`RULE-SET, ${e.url}, ${e.group}, tag=${tag}`);
  });

  // Block domains
  const blockLines = [];
  (doc.block_domains || []).forEach(d => {
    blockLines.push(`DOMAIN-SUFFIX, ${d}, ${REJECT_MODE}`);
  });

  // Final fallback if not present
  const hasFinal = [...baseRuleLines, ...externalLines, ...blockLines].some(l => l.startsWith('FINAL,'));
  const finalLine = 'FINAL, Proxy';

  // Consolidate rule lines in preferred order
  const combinedRules = [...baseRuleLines, ...externalLines, ...blockLines];
  if (!hasFinal) combinedRules.push(finalLine);

  // Deduplicate preserving first occurrence
  const seen = new Set();
  const finalRules = [];
  combinedRules.forEach(l => {
    if (!seen.has(l)) {
      seen.add(l);
      finalRules.push(l);
    }
  });

  // MITM
  const mitmHostnames = Array.from(new Set(doc.mitm_hostnames || [])).sort();
  const sensitive = mitmHostnames.filter(h => SENSITIVE_PATTERNS.test(h));
  if (sensitive.length && !ALLOW_SENSITIVE && INCLUDE_MITM) {
    console.warn(color('yellow', 'Sensitive MITM hostnames detected (omitted). Use --allow-sensitive to include:'));
    sensitive.forEach(h => console.warn('  - ' + h));
  }
  const filteredMitm = INCLUDE_MITM
    ? mitmHostnames.filter(h => ALLOW_SENSITIVE || !SENSITIVE_PATTERNS.test(h))
    : [];

  // CA name
  const CA_UUID = (ARGS['ca-uuid'] || process.env.LOON_CA_UUID || deterministicCA(filteredMitm) || uuidv4()).toUpperCase();

  // Rule categorization (for annotation)
  const categoryMap = {};
  if (ANNOTATE) {
    finalRules.forEach(r => {
      // naive: categorize by common substrings
      if (/REJECT/.test(r)) {
        (categoryMap.Block || (categoryMap.Block = [])).push(r);
      } else if (/RULE-SET/.test(r)) {
        (categoryMap.External || (categoryMap.External = [])).push(r);
      } else if (/GEOIP/.test(r)) {
        (categoryMap.Geo || (categoryMap.Geo = [])).push(r);
      } else {
        (categoryMap.General || (categoryMap.General = [])).push(r);
      }
    });
  }

  // Assemble output
  const out = [];
  const prependBlocks = readBlocks(ARGS.prepend);
  const appendBlocks = readBlocks(ARGS.append);

  if (prependBlocks.length) out.push(...prependBlocks, '');

  out.push('# ------------------------------------------------------------');
  out.push('# Generated Loon Configuration');
  out.push(`# Source: ${INPUT}`);
  out.push(`# Timestamp: ${new Date().toISOString()}`);
  out.push('# ------------------------------------------------------------\n');

  out.push('[General]');
  out.push(`dns-server = ${DNS_SERVERS.join(', ')}`);
  out.push('geoip-db = https://raw.githubusercontent.com/Loyalsoldier/geoip/release/Country.mmdb');
  out.push('');

  out.push('[Proxy]');
  proxies.forEach(p => out.push(loonProxyLine(p)));
  out.push('');

  out.push('[Proxy Group]');
  groups.forEach(g => out.push(`${g.name} = select, ${g.list.join(', ')}`));
  out.push('');

  out.push('[Rule]');
  if (ANNOTATE) {
    Object.entries(categoryMap).forEach(([cat, lines]) => {
      out.push(`# ---- ${cat} Rules ----`);
      lines.forEach(l => out.push(l));
      out.push('');
    });
  } else {
    finalRules.forEach(l => out.push(l));
    out.push('');
  }

  if (doc.scripts?.loader_url) {
    out.push('[Script]');
    out.push(`# Loader script`);
    out.push(`http-response ^https?://.+ script-response-body ${doc.scripts.loader_url}`);
    out.push('');
  }

  if (filteredMitm.length) {
    out.push('[MITM]');
    if (MITM_SKIP_CERT_CHECK) out.push('skip-server-cert-check = true');
    out.push(`hostname = ${filteredMitm.join(', ')}`);
    // Group commentary (optional)
    if (ANNOTATE) {
      const byCat = {};
      filteredMitm.forEach(h => {
        const cat = categorizeHostname(h);
        (byCat[cat] || (byCat[cat] = [])).push(h);
      });
      Object.entries(byCat).forEach(([cat, hs]) => {
        out.push(`# ${cat}: ${hs.length} host(s)`);
      });
    }
    out.push(`CA = ${CA_UUID}.cer`);
    out.push('');
  }

  if (appendBlocks.length) {
    out.push('# -- Appended Blocks --');
    out.push(...appendBlocks, '');
  }

  let content = out.join('\n');

  if (MINIFY) {
    content = content
      .split(/\r?\n/)
      .filter(l => l && !l.startsWith('#'))
      .join('\n');
  }

  // Optional splits
  const fragments = {};
  if (SPLIT_RULES) {
    fragments.base = baseRuleLines.join('\n') + '\n';
    fragments.block = blockLines.join('\n') + '\n';
    fragments.external = externalLines.join('\n') + '\n';
    fragments.mitm = filteredMitm.join('\n') + '\n';
  }

  const meta = {
    proxies: proxies.length,
    proxyGroups: groups.length,
    rules: finalRules.length,
    mitmHostnames: filteredMitm.length,
    dnsServers: DNS_SERVERS,
    rejectMode: REJECT_MODE,
    sensitiveMitmOmitted: sensitive.length && !ALLOW_SENSITIVE ? sensitive : [],
    caIdentifier: CA_UUID,
    minified: MINIFY,
    annotated: ANNOTATE,
    splitRules: SPLIT_RULES,
    hash: sha256(content),
  };

  return { content, fragments, meta };
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

////////////////////////////////////////////////////////////////////////////////
// Main
////////////////////////////////////////////////////////////////////////////////
function main() {
  try {
    const { content, fragments, meta } = build();

    if (DRY) {
      process.stdout.write(content);
    } else {
      fs.mkdirSync(OUT_DIR, { recursive: true });
      fs.writeFileSync(OUT_FILE, content);
      console.log(color('green', `✓ loon.conf → ${path.relative(ROOT, OUT_FILE)}`));
      if (SPLIT_RULES) {
        const rulesDir = path.join(path.dirname(OUT_FILE), 'rules');
        fs.mkdirSync(rulesDir, { recursive: true });
        Object.entries(fragments).forEach(([k, v]) => {
          const fp = path.join(rulesDir, `${k}.conf`);
          fs.writeFileSync(fp, v);
          console.log(color('cyan', `  ↳ rules/${k}.conf`));
        });
      }
      if (EMIT_JSON) {
        const jsonFile = OUT_FILE + '.json';
        fs.writeFileSync(jsonFile, JSON.stringify(meta, null, 2));
        console.log(color('cyan', `  ↳ metadata JSON: ${path.basename(jsonFile)}`));
      }
    }

    if (STATS) {
      console.log(color('magenta', '--- Stats ---'));
      Object.entries(meta).forEach(([k, v]) => {
        if (Array.isArray(v)) console.log(`${k}: ${v.length} entries`);
        else if (typeof v === 'object') console.log(`${k}: (object)`);
        else console.log(`${k}: ${v}`);
      });
      if (meta.sensitiveMitmOmitted.length) {
        console.log(color('yellow', `Sensitive MITM omitted: ${meta.sensitiveMitmOmitted.join(', ')}`));
      }
      console.log(`sha256: ${meta.hash}`);
    }

  } catch (e) {
    console.error(color('red', '✗ Generation failed:'), e.message);
    if (ARGS.debug) console.error(e.stack);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { build, parseArgs };
