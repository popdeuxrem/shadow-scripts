#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// --- Config ---
const SRC_DIR = path.resolve(__dirname, '../src-scripts');
const OUT_DIR = path.resolve(__dirname, '../apps/loader/public/obfuscated');
const TEMP_DIR = path.resolve(__dirname, '../.build/temp-obfuscated');

const options = {
  compact: true,
  selfDefending: true,
  controlFlowFlattening: true,
  disableConsoleOutput: true,
  stringArray: true,
  stringArrayEncoding: 'base64'
};

// --- Helpers ---
const log = (msg) => console.log(`\x1b[36m${msg}\x1b[0m`);
const warn = (msg) => console.warn(`\x1b[33m⚠️ ${msg}\x1b[0m`);
const error = (msg) => {
  console.error(`\x1b[31m❌ ${msg}\x1b[0m`);
  process.exit(1);
};

// --- Obfuscator fallback logic ---
function resolveObfuscator() {
  const candidates = [
    'javascript-obfuscator',
    path.resolve(__dirname, '../node_modules/.bin/javascript-obfuscator'),
    'pnpm dlx javascript-obfuscator'
  ];

  for (const cmd of candidates) {
    try {
      execSync(`${cmd} --version`, { stdio: 'ignore' });
      return cmd;
    } catch (_) {}
  }

  error('Could not locate `javascript-obfuscator`. Make sure it is installed.');
}

const OBFUSCATOR = resolveObfuscator();

// --- Init ---
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });

function findJSFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return findJSFiles(fullPath);
    if (entry.isFile() && fullPath.endsWith('.js')) return [fullPath];
    return [];
  });
}

function obfuscateFile(srcPath) {
  const relative = path.relative(SRC_DIR, srcPath);
  const basename = path.basename(srcPath, '.js');
  const tempOut = path.join(TEMP_DIR, relative);
  const finalOut = path.join(OUT_DIR, `${basename}.js.b64`);

  fs.mkdirSync(path.dirname(tempOut), { recursive: true });

  const args = Object.entries(options)
    .map(([key, val]) => `--${key} ${val}`)
    .join(' ');

  try {
    execSync(`${OBFUSCATOR} "${srcPath}" --output "${tempOut}" ${args}`, {
      stdio: 'inherit'
    });

    const obfuscated = fs.readFileSync(tempOut, 'utf8');
    const encoded = Buffer.from(obfuscated).toString('base64');
    fs.writeFileSync(finalOut, encoded);
    log(`🔐 ${srcPath} → ${finalOut}`);
  } catch (err) {
    warn(`Obfuscation failed: ${srcPath}`);
  }
}

// --- Run ---
log('🔐 Obfuscating JS payloads\n');
const jsFiles = findJSFiles(SRC_DIR);
if (jsFiles.length === 0) {
  warn(`No JS files found in ${SRC_DIR}`);
} else {
  log(`📦 Found ${jsFiles.length} .js files to process...\n`);
  jsFiles.forEach(obfuscateFile);
}

log('\n✅ Obfuscation complete.');
