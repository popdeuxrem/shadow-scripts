// scripts/gen-mobileconfig.js
const fs = require("fs");
const { v4: uuidv4 } = require("uuid");

const {
  DNS_SERVER = "premiusa1.vpnjantit.com",          // Fallback to your host
  DNS_PROTOCOL,                                    // 'https' (DoH), 'tls' (DoT), or empty
  DOH_URL,                                         // Required if DNS_PROTOCOL is set
  PROFILE_NAME = "Stealth DNS/Proxy",
  OUTPUT = "apps/loader/public/configs/stealth-dns.mobileconfig",
} = process.env;

const payloadUUID = uuidv4().toUpperCase();

const dnsSettings = {
  ServerAddresses: [DNS_SERVER],
  SupplementalMatchDomains: ["."],
  MatchDomainsNoSearch: true,
};

if (DNS_PROTOCOL && DOH_URL) {
  dnsSettings.DNSProtocol = DNS_PROTOCOL;
  dnsSettings.ServerURL = DOH_URL;
}

const profile = {
  PayloadContent: [
    {
      PayloadDescription: "Configures DNS for stealth proxy/DoH on iOS.",
      PayloadDisplayName: PROFILE_NAME,
      PayloadIdentifier: `com.shadow.${payloadUUID}`,
      PayloadType: "com.apple.dnsSettings.managed",
      PayloadUUID: payloadUUID,
      PayloadVersion: 1,
      DNSSettings: dnsSettings,
    },
  ],
  PayloadDisplayName: PROFILE_NAME,
  PayloadIdentifier: `com.shadow.${payloadUUID}`,
  PayloadRemovalDisallowed: false,
  PayloadType: "Configuration",
  PayloadUUID: payloadUUID,
  PayloadVersion: 1,
};

// Helper: write as Apple plist (minimal, manual XML)
function toPlist(obj, indent = 0) {
  const pad = (n) => "  ".repeat(n);
  if (Array.isArray(obj)) {
    return `<array>\n${obj.map(v => pad(indent + 1) + toPlist(v, indent + 1)).join('\n')}\n${pad(indent)}</array>`;
  }
  if (typeof obj === "object" && obj !== null) {
    return `<dict>\n${Object.entries(obj)
      .map(([k, v]) => `${pad(indent + 1)}<key>${k}</key>\n${pad(indent + 1)}${toPlist(v, indent + 1)}`)
      .join('\n')}\n${pad(indent)}</dict>`;
  }
  if (typeof obj === "boolean") return `<${obj}/>`;
  if (typeof obj === "number") return `<integer>${obj}</integer>`;
  // Escape XML
  return `<string>${String(obj).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")}</string>`;
}

const xml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n` +
  `<plist version="1.0">\n` +
  toPlist(profile, 0) +
  `\n</plist>\n`;

fs.mkdirSync(require("path").dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, xml);

console.log(`✅ Generated: ${OUTPUT}\n`);
