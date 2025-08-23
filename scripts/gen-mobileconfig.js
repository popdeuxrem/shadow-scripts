#!/usr/bin/env node

const fs = require('fs');
const dns = require('dns');
const { v4: uuidv4 } = require('uuid');

const serverArg = process.env.DNS_SERVER || process.argv[2];
const outFile = process.env.OUT || process.argv[3] || 'apps/loader/public/configs/stealth-dns.mobileconfig';
const profileName = process.env.DNS_PROFILE_NAME || "Stealth DNS/Proxy";
const protocol = process.env.DNS_PROTOCOL; // e.g., "https" for DoH
const dohUrl = process.env.DOH_URL;        // e.g., "https://cloudflare-dns.com/dns-query"

if (!serverArg) {
  console.error("❌ Please provide DNS_SERVER env or argument (IP or hostname)");
  process.exit(1);
}

// If comma separated, split to array
let rawServers = serverArg.split(',').map(s => s.trim()).filter(Boolean);

function resolveServers(servers) {
  return Promise.all(
    servers.map(server =>
      /^\d+\.\d+\.\d+\.\d+$/.test(server)
        ? Promise.resolve(server)
        : new Promise((resolve, reject) =>
            dns.resolve4(server, (err, addresses) => {
              if (err || !addresses.length) reject(new Error(`Could not resolve ${server}`));
              else resolve(addresses[0]); // take first IP
            })
          )
    )
  );
}

async function main() {
  let addresses;
  try {
    addresses = await resolveServers(rawServers);
  } catch (e) {
    console.error(`❌ DNS resolution error:`, e.message);
    process.exit(2);
  }

  // Validate all addresses
  addresses.forEach(ip => {
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) {
      console.error(`❌ Invalid IP: ${ip}`);
      process.exit(3);
    }
  });

  const payloadUUID = uuidv4().toUpperCase();
  const now = new Date().toISOString();
  const DNSSettings = {
    ServerAddresses: addresses
  };
  if (protocol && dohUrl) {
    DNSSettings.DNSProtocol = protocol;
    DNSSettings.ServerURL = dohUrl;
  }

  const mobileconfig = {
    PayloadContent: [
      {
        PayloadDescription: "Configures DNS for stealth proxy/DoH on iOS.",
        PayloadDisplayName: profileName,
        PayloadIdentifier: `com.shadow.${payloadUUID}`,
        PayloadType: "com.apple.dnsSettings.managed",
        PayloadUUID: payloadUUID,
        PayloadVersion: 1,
        DNSSettings,
      }
    ],
    PayloadDisplayName: profileName,
    PayloadIdentifier: `com.shadow.${payloadUUID}`,
    PayloadRemovalDisallowed: false,
    PayloadType: "Configuration",
    PayloadUUID: payloadUUID,
    PayloadVersion: 1,
    // Optionally:
    // PayloadOrganization: "Shadow Scripts",
    // PayloadDescription: `Generated ${now}`
  };

  // Write XML plist
  const plist = require('plist');
  const xml = plist.build(mobileconfig);

  fs.mkdirSync(require('path').dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, xml);
  console.log(`✅ Mobileconfig written: ${outFile}`);
  console.log(`Addresses: ${addresses.join(', ')}`);
}

main();
