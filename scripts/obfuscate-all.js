#!/usr/bin/env node
/**
 * scripts/obfuscate-all.js — GROK MAX PRO Obfuscator Pipeline
 * ──────────────────────────────────────────────────────────────
 * Features:
 *  - Scans src-scripts/* for all JS payloads
 *  - Multi-stage obfuscation + base64 encoding + optional AES/RC4
 *  - Generates .b64, .ob.js, and .meta.json for each payload
 *  - Updates manifest.json automatically
 *  - CI/CD friendly with neon console logging
 *  - Cyberpunk loader ready
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import zlib from "zlib";
import { execSync } from "child_process";
import obfuscator from "javascript-obfuscator";

const ROOT = path.resolve(new URL(import.meta.url).pathname, "..", "..");
const SRC = path.join(ROOT, "src-scripts");
const DST = path.join(ROOT, "apps/loader/public/obfuscated");
const MANIFEST_FILE = path.join(ROOT, "apps/loader/public/manifest.json");

const log = (msg) => console.log(`%c🛠 Cyberpunk Obfuscator → ${msg}`, "color:#0ff;font-weight:bold;");

const PROFILES = {
  light: { compact: false, stringArray: true, stringArrayThreshold: 0.3 },
  medium: { compact: true, controlFlowFlattening: true, stringArray: true, stringArrayEncoding: ["base64"] },
  heavy: { compact: true, controlFlowFlattening: true, deadCodeInjection: true, stringArrayEncoding: ["base64","rc4"], selfDefending: true },
  stealth: { compact: true, controlFlowFlattening: true, deadCodeInjection: true, stringArrayEncoding: ["base64","rc4"], selfDefending: true, debugProtection: true }
};

// ──────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────
const sha256 = (data) => crypto.createHash("sha256").update(data).digest("hex");
const commitHash = () => {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); } 
  catch { return "unknown"; }
};

async function encodePipeline(content, stages = ["base64"]) {
  let buf = Buffer.from(content, "utf8");
  const meta = { stages: [], keys: [] };

  for (const s of stages) {
    switch(s) {
      case "base64": buf = Buffer.from(buf.toString("base64")); meta.stages.push("base64"); break;
      case "gzip": buf = zlib.gzipSync(buf); meta.stages.push("gzip"); break;
      case "xor": {
        const key = crypto.randomBytes(16).toString("hex");
        const out = Buffer.alloc(buf.length);
        for (let i=0;i<buf.length;i++) out[i] = buf[i] ^ key.charCodeAt(i % key.length);
        buf = out;
        meta.stages.push("xor"); meta.keys.push(key);
        break;
      }
    }
  }
  return { encoded: buf.toString("base64"), meta };
}

// ──────────────────────────────────────────────────────────────
// Obfuscate a single file
// ──────────────────────────────────────────────────────────────
async function obfuscateFile(file, profile = "medium") {
  const rel = path.relative(SRC, file);
  if (!rel.endsWith(".js") || rel.endsWith(".ob.js")) return null;

  const content = await fs.readFile(file, "utf8");
  const obfProfile = PROFILES[profile] || PROFILES.medium;
  const obfCode = obfuscator.obfuscate(content, obfProfile).getObfuscatedCode();

  const { encoded, meta: encMeta } = await encodePipeline(obfCode, ["base64","xor","gzip"]);
  const integrity = sha256(obfCode);

  const outFile = path.join(DST, rel).replace(/\.js$/, ".ob.js");
  const outB64 = outFile.replace(/\.ob\.js$/, ".b64");
  const metaFile = outFile + ".meta.json";

  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, obfCode, "utf8");
  await fs.writeFile(outB64, encoded, "utf8");
  await fs.writeFile(metaFile, JSON.stringify({
    source: { file: rel, hash: sha256(content), size: content.length },
    obfuscated: { hash: integrity, size: obfCode.length, profile },
    encoding: encMeta,
    build: { commit: commitHash(), timestamp: new Date().toISOString() }
  }, null, 2));

  log(`🔒 Obfuscated ${rel} → ${path.basename(outB64)}`);
  return { file: rel, hash: integrity };
}

// ──────────────────────────────────────────────────────────────
// Scan src-scripts and process all JS files
// ──────────────────────────────────────────────────────────────
async function run() {
  const files = (function walk(d){
    return fs.readdir(d, {withFileTypes:true}).then(list => 
      Promise.all(list.flatMap(e=> e.isDirectory()? walk(path.join(d,e.name)):[path.join(d,e.name)]))
    );
  })(SRC).then(arr=> arr.flat());

  const results = [];
  for (const f of await files) {
    try { const r = await obfuscateFile(f, "stealth"); if(r) results.push(r); }
    catch(e){ console.error("❌ Error:", f, e.message); }
  }

  // Update manifest.json
  let manifest = {};
  try { manifest = JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")); } catch {}
  manifest.payloads = manifest.payloads || {};
  results.forEach(r => manifest.payloads[path.basename(r.file, ".js")] = { file: `/obfuscated/${path.basename(r.file).replace(/\.js$/,".b64")}`, sha256: r.hash, version: "0.0.0" });
  await fs.writeFile(MANIFEST_FILE, JSON.stringify(manifest, null, 2));
  log(`📄 manifest.json updated with ${results.length} payloads`);
}

run().catch(err=>{ console.error("Fatal:", err); process.exit(1); });
