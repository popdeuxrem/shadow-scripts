// scripts/gen-mobileconfig.js
const fs = require('fs');
const path = require('path');
const plist = require('plist');

const OUTPUT = path.resolve(__dirname, '../dist/shadow_config.mobileconfig');

// Customize as needed
const CONFIG = {
  displayName: 'ShadowMITM AutoLoader',
  proxyURL: 'https://popdeuxrem.github.io/shadow-scripts/index.html#inject=all',
  organization: 'Quantum Scripts',
  identifier: 'com.shadowrocket.mitm-loader',
  uuid: () => crypto.randomUUID?.() || require('crypto').randomUUID(),
};

const mobileconfig = {
  PayloadContent: [
    {
      PayloadDescription: 'Install this profile to enable Shadowrocket MITM Loader.',
      PayloadDisplayName: CONFIG.displayName,
      PayloadIdentifier: CONFIG.identifier,
      PayloadOrganization: CONFIG.organization,
      PayloadType: 'com.apple.webClip.managed',
      PayloadUUID: CONFIG.uuid(),
      PayloadVersion: 1,
      Label: CONFIG.displayName,
      URL: CONFIG.proxyURL,
      IsRemovable: true,
      FullScreen: true,
      Icon: Buffer.from(
        fs.readFileSync(path.resolve(__dirname, 'icon-base64.txt'), 'utf8')
          .replace(/^data:image\/png;base64,/, ''),
        'base64'
      ).toString('base64'),
    },
  ],
  PayloadDisplayName: CONFIG.displayName,
  PayloadIdentifier: CONFIG.identifier,
  PayloadOrganization: CONFIG.organization,
  PayloadRemovalDisallowed: false,
  PayloadType: 'Configuration',
  PayloadUUID: CONFIG.uuid(),
  PayloadVersion: 1,
};

fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
fs.writeFileSync(OUTPUT, plist.build(mobileconfig));
console.log(`✅ mobileconfig written to ${OUTPUT}`);
