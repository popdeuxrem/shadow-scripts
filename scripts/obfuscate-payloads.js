#!/usr/bin/env node

const { execSync } = require('child_process');
const { readdirSync, statSync, mkdirSync } = require('fs');
const { join, dirname } = require('path');

const INPUT_DIR = 'src-scripts';
const OUTPUT_DIR = '.build/temp-obfuscated';
const TARGET_SUFFIX = '-obfuscated.js';

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const fullPath = join(dir, entry);
    return statSync(fullPath).isDirectory()
      ? walk(fullPath)
      : fullPath;
  });
}

const files = walk(INPUT_DIR).filter(f => f.endsWith(TARGET_SUFFIX));

if (files.length === 0) {
  console.log('No obfuscated files to process.');
  process.exit(0);
}

console.log(`📦 Found ${files.length} .js files to process...\n`);

files.forEach((inputPath) => {
  const relPath = inputPath.replace(`${INPUT_DIR}/`, '');
  const outputPath = join(OUTPUT_DIR, relPath);

  mkdirSync(dirname(outputPath), { recursive: true });

  console.log(`⚙️  Obfuscating ${relPath}...`);
  try {
    execSync(`npx javascript-obfuscator "${inputPath}" \
      --output "${outputPath}" \
      --compact true \
      --self-defending true \
      --control-flow-flattening true \
      --string-array true`, { stdio: 'inherit' });
  } catch (err) {
    console.error(`❌ Failed to obfuscate ${relPath}`);
    process.exit(1);
  }
});

console.log('\n✅ All files obfuscated successfully.');
