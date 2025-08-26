// scripts/gen-manifest.js
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const distDir = path.resolve(__dirname, '../dist-scripts');
const outputFile = path.resolve(__dirname, '../dist/manifest.json');

const now = new Date().toISOString();

const entries = fs.readdirSync(distDir)
  .filter(file => file.endsWith('.b64'))
  .map(file => {
    const filePath = path.join(distDir, file);
    const contents = fs.readFileSync(filePath, 'utf8');
    const sha256 = crypto.createHash('sha256').update(contents).digest('hex');
    const size = Buffer.byteLength(contents, 'utf8');

    const name = file.replace(/\.b64$/, '');
    const display = name
      .replace(/[-_]/g, ' ')
      .replace(/\b\w/g, c => c.toUpperCase());

    return {
      id: name,
      displayName: display,
      sha256,
      updated: now,
      size,
      path: `./${file}`
    };
  });

const manifest = {
  updated: now,
  total: entries.length,
  scripts: entries
};

fs.writeFileSync(outputFile, JSON.stringify(manifest, null, 2));
console.log(`✅ manifest.json written with ${entries.length} entries`);
