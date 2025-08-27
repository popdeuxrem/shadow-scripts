// scripts/gen-mobileconfig.js
// Generates a valid Cloudflare DoH .mobileconfig (no VPN payload)

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ORG_NAME   = 'popdeuxrem';
const PROFILE_ID = 'com.popdeuxrem.shadow.doh';
const DISPLAY    = 'Shadow-Scripts • Cloudflare DoH';

const CLOUDFLARE = {
  serverURL:  'https://cloudflare-dns.com/dns-query',
  serverName: 'cloudflare-dns.com',
  addrs:      ['1.1.1.1', '1.0.0.1'],
};

const outFile = path.resolve(__dirname, '../apps/loader/public/configs/shadow_doh.mobileconfig');

function uuid() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  // fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.randomBytes(1)[0] % 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function dohPayload({ serverURL, serverName, addrs }) {
  return `
    <dict>
      <key>PayloadType</key><string>com.apple.dnsSettings.managed</string>
      <key>PayloadVersion</key><integer>1</integer>
      <key>PayloadIdentifier</key><string>${PROFILE_ID}.doh</string>
      <key>PayloadUUID</key><string>${uuid()}</string>
      <key>PayloadDisplayName</key><string>${DISPLAY}</string>
      <key>PayloadOrganization</key><string>${ORG_NAME}</string>
      <key>ProhibitDisablement</key><false/>
      <key>DNSSettings</key>
      <dict>
        <key>DNSProtocol</key><string>HTTPS</string>
        <key>ServerURL</key><string>${serverURL}</string>
        <key>ServerName</key><string>${serverName}</string>
        <key>ServerAddresses</key>
        <array>${addrs.map(a => `<string>${a}</string>`).join('')}</array>
      </dict>
    </dict>`;
}

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>PayloadType</key><string>Configuration</string>
  <key>PayloadVersion</key><integer>1</integer>
  <key>PayloadIdentifier</key><string>${PROFILE_ID}</string>
  <key>PayloadUUID</key><string>${uuid()}</string>
  <key>PayloadDisplayName</key><string>${DISPLAY}</string>
  <key>PayloadOrganization</key><string>${ORG_NAME}</string>
  <key>PayloadDescription</key>
  <string>Installs DNS over HTTPS using Cloudflare (1.1.1.1). No VPN payload.</string>
  <key>PayloadContent</key>
  <array>
    ${dohPayload(CLOUDFLARE)}
  </array>
</dict></plist>
`;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, plist);
console.log(`✅ DoH profile written: ${outFile}`);
