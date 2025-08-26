// scripts/gen-index-loader.js
const fs = require('fs');
const path = require('path');

const manifestPath = path.resolve(__dirname, '../dist/manifest.json');
const templatePath = path.resolve(__dirname, './manifest-template.html');
const outputPath = path.resolve(__dirname, '../dist/index.html');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const template = fs.readFileSync(templatePath, 'utf8');

function renderScriptRow(entry) {
  return `<tr>
    <td>${entry.displayName}</td>
    <td><code>${entry.id}</code></td>
    <td>${entry.size}b</td>
    <td><code>${entry.sha256.slice(0, 8)}</code></td>
    <td><a href="${entry.path}" target="_blank">.b64</a></td>
  </tr>`;
}

const renderedRows = manifest.scripts.map(renderScriptRow).join('\n');

const injected = template
  .replace('__SPOOF_TARGETS__', renderedRows)
  .replace('__UPDATED_AT__', manifest.updated)
  .replace('__TOTAL_COUNT__', manifest.total.toString());

fs.writeFileSync(outputPath, injected);
console.log(`✅ dist/index.html written with ${manifest.total} spoof entries`);
