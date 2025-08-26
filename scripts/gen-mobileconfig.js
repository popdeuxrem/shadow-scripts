// scripts/gen-mobileconfig.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto'); // Added the missing crypto import

// Update the output path to match build-all.sh's expected structure
const outputDir = path.resolve(__dirname, '../apps/loader/public/configs');
// Create the directory if it doesn't exist
fs.mkdirSync(outputDir, { recursive: true });

const outputPath = path.resolve(outputDir, 'shadow_config.mobileconfig');

const proxyDomain = "popdeuxrem.github.io";
const loaderURL = "https://popdeuxrem.github.io/shadow-scripts/index.html";
const proxyName = "US Stealth Proxy";

const content = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
 "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadDisplayName</key>
  <string>Shadow-Scripts Stealth</string>
  <key>PayloadIdentifier</key>
  <string>com.popdeuxrem.shadowconfig</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>${crypto.randomUUID()}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>PayloadType</key>
      <string>com.apple.vpn.managed</string>
      <key>PayloadIdentifier</key>
      <string>com.popdeuxrem.shadowconfig.vpn</string>
      <key>PayloadUUID</key>
      <string>${crypto.randomUUID()}</string>
      <key>PayloadDisplayName</key>
      <string>${proxyName}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>UserDefinedName</key>
      <string>${proxyName}</string>
      <key>VPNType</key>
      <string>IKEv2</string>
      <key>IKEv2</key>
      <dict>
        <key>RemoteAddress</key>
        <string>${proxyDomain}</string>
        <key>RemoteIdentifier</key>
        <string>${proxyDomain}</string>
        <key>LocalIdentifier</key>
        <string>stealth</string>
        <key>AuthenticationMethod</key>
        <string>None</string>
        <key>UseConfigurationAttributeInternalIPSubnet</key>
        <false/>
        <key>DeadPeerDetectionRate</key>
        <string>Medium</string>
        <key>EnablePFS</key>
        <true/>
        <key>DisableMOBIKE</key>
        <false/>
        <key>UseExtendedAuthentication</key>
        <true/>
        <key>DisconnectOnIdle</key>
        <integer>0</integer>
        <key>DNS</key>
        <array>
          <string>1.1.1.1</string>
          <string>8.8.8.8</string>
        </array>
      </dict>
    </dict>
  </array>
</dict>
</plist>`;

fs.writeFileSync(outputPath, content);
console.log('✅ shadow_config.mobileconfig generated.');
