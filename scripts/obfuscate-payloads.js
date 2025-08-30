#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SRC_DIR = 'src-scripts';
const OUT_DIR = '.build/temp-obfuscated';
const GIT_COMMIT = process.env.GIT_COMMIT || 'dev';

const getAllJsFiles = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap(entry => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? getAllJsFiles(fullPath) : (fullPath.endsWith('.js') ? [fullPath] : []);
  });
};

const resolveObfuscatorBinary = () => {
  try {
    return execSync('which javascript-obfuscator').toString().trim();
  } catch {
    const fallback = path.resolve(__dirname, '../node_modules/.bin/javascript-obfuscator');
    if (fs.existsSync(fallback)) return fallback;
    console.error('\n❌ javascript-obfuscator not found. Install it via:\n\n  pnpm add -D javascript-obfuscator\n');
    process.exit(1);
  }
};

const obfuscator = resolveObfuscatorBinary();
const files = getAllJsFiles(SRC_DIR);

console.log(`📦 Found ${files.length} .js files to process...\n`);

files.forEach((inputPath) => {
  const relPath = path.relative(SRC_DIR, inputPath);
  const outPath = path.join(OUT_DIR, relPath);
  const outDir = path.dirname(outPath);

  const tempPath = inputPath.replace(/\.js$/, '-obfuscated.js');
  const original = fs.readFileSync(inputPath, 'utf8');
  const withHash = `// Build Commit: ${GIT_COMMIT}\n${original}`;

  fs.mkdirSync(path.dirname(tempPath), { recursive: true });
  fs.writeFileSync(tempPath, withHash, 'utf8');
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`⚙️  Obfuscating ${relPath}...`);
  try {
    execSync(
      `${obfuscator} "${tempPath}" --output "${outPath}" ` +
      '--compact true --self-defending true --control-flow-flattening true --string-array true',
      { stdio: 'inherit' }
    );
    fs.unlinkSync(tempPath); // clean up
  } catch (err) {
    console.error(`❌ Failed to obfuscate ${relPath}`, err.message);
  }
});

console.log('\n✅ All payloads obfuscated and cleaned up.\n');
