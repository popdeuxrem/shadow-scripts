#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");
const { v4: uuidv4 } = require("uuid"); // Need uuid: pnpm add -Dw uuid

function readYaml(filepath) {
  return yaml.load(fs.readFileSync(filepath, "utf8"));
}

// Determine DNS/Proxy endpoint from YAML
function getDnsOrProxy(rules) {
  // Priority: rules.dns, then rules.proxy, fallback to 1.1.1.1
  if (rules.stealth_dns) return rules.stealth_dns;
  if (rules.dns) return rules.dns;
  // Optionally pull from your proxies list
  if (rules.proxies) {
    // Flat extract if nested
    let proxies = Array.isArray(rules.proxies)
      ? rules.proxies
      : Object.values(rules.proxies).flat();
    if (proxies.length && proxies[0].host) return proxies[0].host;
  }
  return "1.1.1.1";
}

function renderMobileconfig(dnsAddr, profileName = "Stealth DNS/Proxy") {
  const uuid = uuidv4().toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadDescription</key>
      <string>Configures DNS for stealth proxy/DoH on iOS.</string>
      <key>PayloadDisplayName</key>
      <string>${profileName}</string>
      <key>PayloadIdentifier</key>
      <string>com.shadow.${uuid}</string>
      <key>PayloadType</key>
      <string>com.apple.dnsSettings.managed</string>
      <key>PayloadUUID</key>
      <string>${uuid}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>DNSSettings</key>
      <dict>
        <key>ServerAddresses</key>
        <array>
          <string>${dnsAddr}</string>
        </array>
      </dict>
    </dict>
  </array>
  <key>PayloadDisplayName</key>
  <string>${profileName}</string>
  <key>PayloadIdentifier</key>
  <string>com.shadow.${uuid}</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${uuid}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>`;
}

// Entrypoint
function main() {
  const inFile = process.argv[2] || path.resolve(__dirname, "../configs/master-rules.yaml");
  const outFile = "stealth-dns.mobileconfig";
  const rules = readYaml(inFile);
  const dns = getDnsOrProxy(rules);
  const content = renderMobileconfig(dns);
  const outdir = path.resolve(__dirname, "../apps/loader/public/configs");
  fs.mkdirSync(outdir, { recursive: true });
  fs.writeFileSync(path.join(outdir, outFile), content);
  console.log(`Wrote: ${outFile} (for DNS: ${dns})`);
}

main();
