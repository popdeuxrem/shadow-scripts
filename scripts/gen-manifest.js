#!/usr/bin/env node
/**
 * gen-manifest.js
 * ──────────────────────────────────────────────────────────────
 * Generates manifest.json for Shadow Scripts.
 * Includes version, commit, build date, and file listing.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT, "apps/loader/public");
const OBF_DIR = path.join(PUBLIC_DIR, "obfuscated");
const CONF_DIR = path.join(PUBLIC_DIR, "configs");
const OUTPUT_FILE = path.join(PUBLIC_DIR, "manifest.json");

// Env values passed from build-all.sh or GitHub Actions
const VERSION = process.env.VERSION || "0.0.0";
const GIT_COMMIT = process.env.GIT_COMMIT || "dev";
const GIT_BRANCH = process.env.GIT_BRANCH || "unknown";
const BUILD_DATE =
  process.env.BUILD_DATE || new Date().toISOString();

function listFiles(dir, extFilter = null) {
  if (!fs.existsSync(dir)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...listFiles(fullPath, extFilter));
    } else {
      if (!extFilter || entry.name.endsWith(extFilter)) {
        files.push(path.relative(PUBLIC_DIR, fullPath).replace(/\\/g, "/"));
      }
    }
  }
  return files;
}

function fileHash(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

function buildManifest() {
  const payloads = listFiles(OBF_DIR, ".b64");
  const configs = listFiles(CONF_DIR);

  const payloadMeta = payloads.map(f => ({
    path: f,
    size: fs.statSync(path.join(PUBLIC_DIR, f)).size,
    hash: fileHash(path.join(PUBLIC_DIR, f)).slice(0, 16),
  }));

  const configMeta = configs.map(f => ({
    path: f,
    size: fs.statSync(path.join(PUBLIC_DIR, f)).size,
    hash: fileHash(path.join(PUBLIC_DIR, f)).slice(0, 16),
  }));

  const manifest = {
    version: VERSION,
    commit: GIT_COMMIT,
    branch: GIT_BRANCH,
    buildDate: BUILD_DATE,
    payloads: payloadMeta,
    configs: configMeta,
    stats: {
      payloadCount: payloadMeta.length,
      configCount: configMeta.length,
      totalSize:
        payloadMeta.reduce((a, f) => a + f.size, 0) +
        configMeta.reduce((a, f) => a + f.size, 0),
    },
  };

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true });
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(manifest, null, 2));

  console.log(`✅ Manifest written: ${OUTPUT_FILE}`);
}

buildManifest();
