#!/usr/bin/env node
/**
 * scripts/gen-redteam-wrapper.js - Enhanced Red Team Module Generator
 * ------------------------------------------------------------
 * Generates security research module wrappers with enhanced metadata
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Simple UUID generator to avoid dependency
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Simple glob function to avoid dependency
function globFiles(pattern) {
  const baseDir = pattern.split('/**')[0];
  const files = [];
  
  function walkDir(dir) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walkDir(fullPath);
      } else if (entry.name.endsWith('.b64')) {
        files.push(fullPath);
      }
    }
  }
  
  walkDir(baseDir);
  return files;
}

const SRC_DIR = 'src-scripts';
const OUTPUT_DIR = 'apps/loader/public/redteam-modules';
const MANIFEST_FILE = 'apps/loader/public/redteam-manifest.json';

const CATEGORY_MAP = {
  auth: 'auth-fallback-simulations',
  finance: 'payment-edge-cases',
  social: 'social-api-qa',
  security: 'defensive-testing',
  device: 'device-fingerprint-testing',
  network: 'network-policy-test',
  ai: 'ai-auth-response-tests',
};

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function wrapPayload(filepath) {
  const base64 = fs.readFileSync(filepath, 'utf-8');
  const relative = path.relative(SRC_DIR, filepath);
  const [category, filename] = relative.split(path.sep);
  
  // Generate metadata hash for integrity
  const hash = crypto.createHash('sha256').update(base64).digest('hex');

  return {
    id: generateUUID(),
    category: CATEGORY_MAP[category] || 'uncategorized',
    name: path.basename(filename, '.js'),
    file: `redteam-modules/${filename}.b64`,
    description: `Red team module for simulating ${CATEGORY_MAP[category] || 'custom'} behavior.`,
    encoded: base64,
    metadata: {
      size: Buffer.from(base64, 'base64').length,
      hash: hash,
      generated: new Date().toISOString()
    }
  };
}

function generateManifest(modules) {
  return {
    schemaVersion: 1,
    updated: new Date().toISOString(),
    modules,
  };
}

function main() {
  console.log('🔧 [gen-redteam-wrapper] Starting red team module generation...');
  
  ensureDir(OUTPUT_DIR);
  const payloads = globFiles(`${SRC_DIR}/**/*.b64`);
  const modules = [];

  console.log(`Found ${payloads.length} payload files to wrap`);

  for (const payload of payloads) {
    const data = wrapPayload(payload);
    const outPath = path.join(OUTPUT_DIR, path.basename(payload));
    
    try {
      fs.copyFileSync(payload, outPath);
      modules.push({
        id: data.id,
        category: data.category,
        name: data.name,
        file: data.file,
        description: data.description,
        metadata: data.metadata
      });
      console.log(`✅ Wrapped: ${data.name} (${data.category})`);
    } catch (err) {
      console.error(`❌ Failed to wrap ${payload}: ${err.message}`);
    }
  }

  const manifest = generateManifest(modules);
  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  
  console.log(`✅ Red team manifest generated: ${MANIFEST_FILE}`);
  console.log(`   Modules: ${modules.length}`);
  console.log(`   Categories: ${[...new Set(modules.map(m => m.category))].length}`);
}

main();
