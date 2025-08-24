// scripts/gen-mobileconfig.js
// -----------------------------------------------------------------------------
// Build-time helper: generate a minimal DNS-only mobileconfig that points
// iOS/macOS to your stealth DoH / proxy DNS resolver.
//
// Env vars consumed:
//   MASTER_RULES  – YAML path (defaults to configs/master-rules.yaml)
//   DNS_SERVER    – IP or hostname (defaults to 1.1.1.1)
//   PREFER_GROUP  – unused here but reserved for later
// -----------------------------------------------------------------------------
import fs   from 'fs';
import path from 'path';
import { v4 as uuidv4 }   from 'uuid';
import plist              from 'plist';
import yaml               from 'js-yaml';

const ROOT      = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const RULE_FILE = process.env.MASTER_RULES || 'configs/master-rules.yaml';
const DNS       = process.env.DNS_SERVER   || '1.1.1.1';
const OUT_DIR   = path.join(ROOT, 'apps/loader/public/configs');
const OUT_FILE  = path.join(OUT_DIR, 'stealth-dns.mobileconfig');

// ─ helpers ────────────────────────────────────────────────────────────────────
function loadYaml(fp) {
  try {
    const raw = fs.readFileSync(fp, 'utf8');
    return yaml.load(raw);
  } catch (e) {
    console.error(`Unable to read ${fp}`, e);
    process.exit(1);
  }
}

// ─ main ──────────────────────────────────────────────────────────────────────
const rules = loadYaml(RULE_FILE);     // we might use hostnames later

const payloadUUID  = uuidv4().toUpperCase();
const profileUUID  = uuidv4().toUpperCase();

const profile = {
  PayloadDescription   : 'Configures DNS for Stealth Proxy',
  PayloadDisplayName   : 'Stealth DNS / Proxy',
  PayloadIdentifier    : `com.shadow.${profileUUID}`,
  PayloadRemovalDisallowed: false,
  PayloadType          : 'Configuration',
  PayloadUUID          : profileUUID,
  PayloadVersion       : 1,
  PayloadContent: [
    {
      PayloadType       : 'com.apple.dnsSettings.managed',
      PayloadVersion    : 1,
      PayloadDescription: 'DoH / secure DNS for stealth proxy',
      PayloadDisplayName: 'DNS Resolver',
      PayloadIdentifier : `com.shadow.dns.${payloadUUID}`,
      PayloadUUID       : payloadUUID,
      DNSSettings: {
        ServerAddresses: [ DNS ]
      }
    }
  ]
};

// ensure path + write
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_FILE, plist.build(profile));
console.log(`✓ wrote ${OUT_FILE}`);
