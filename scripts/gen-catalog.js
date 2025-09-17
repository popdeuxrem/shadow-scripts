#!/usr/bin/env node
/**
 * scripts/gen-catalog.js
 * ─────────────────────────────────────────────
 * GROK MAX PRO Cyberpunk Catalog Generator
 *
 * Generates apps/loader/public/qrcodes/catalog.json
 * from obfuscated payloads for interactive dashboards.
 *
 * Node: 18+
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = path.resolve(new URL(import.meta.url).pathname, "..", "..");
const PUBLIC = path.join(ROOT, "apps", "loader", "public");
const OBF_DIR = path.join(PUBLIC, "obfuscated");
const OUT_DIR = path.join(PUBLIC, "qrcodes");
const OUT_FILE = path.join(OUT_DIR, "catalog.json");

const argv = process.argv.slice(2);
const opts = {
  ci: argv.includes("--ci"),
  previewLines: Number(process.env.MANIFEST_PREVIEW_LINES || 8),
};

const neon = (msg, color = 51) => console.log(`\x1b[38;5;${color}m💠 ${msg}\x1b[0m`);
const neonWarn = (msg) => console.log(`\x1b[38;5;196m⚠ ${msg}\x1b[0m`);
const neonSuccess = (msg) => console.log(`\x1b[38;5;82m✔ ${msg}\x1b[0m`);

async function exists(p) { try { await fs.access(p); return true; } catch { return false; } }
function shaHex(alg, buf) { return crypto.createHash(alg).update(buf).digest("hex"); }

function runGitMeta() {
  try {
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const date = spawnSync("git", ["show", "-s", "--format=%cI", sha], { encoding: "utf8" }).stdout.trim();
    return { sha, branch, date };
  } catch { return null; }
}

async function readSample(fp, maxLines = 8) {
  try {
    const txt = await fs.readFile(fp, "utf8");
    const lines = txt.split(/\r?\n/);
    return { preview: lines.slice(0, maxLines).join("\n"), lines: lines.length, truncated: lines.length > maxLines };
  } catch { return null; }
}

async function scanPayloads() {
  if (!(await exists(OBF_DIR))) {
    neonWarn(`Obfuscated directory not found: ${OBF_DIR}`);
    process.exit(2);
  }

  const files = (await fs.readdir(OBF_DIR)).filter(f => f.endsWith(".b64") || f.endsWith(".ob.js")).sort();
  const catalog = [];

  neon(`Scanning ${files.length} payloads...`);

  for (let i = 0; i < files.length; i++) {
    const fname = files[i];
    const fp = path.join(OBF_DIR, fname);
    const buf = await fs.readFile(fp);
    const st = await fs.stat(fp);

    const sha256 = shaHex("sha256", buf);
    const sha512 = shaHex("sha512", buf);
    const preview = await readSample(fp, opts.previewLines);

    catalog.push({
      filename: fname,
      url: `obfuscated/${fname}`,
      size: st.size,
      mtime: st.mtime.toISOString(),
      sha256,
      sha512,
      preview,
    });

    process.stdout.write(`\r[${"#".repeat(i+1)}${"-".repeat(files.length-i-1)}] ${i+1}/${files.length} ${fname}`);
  }
  console.log("");
  neonSuccess("Payload scanning complete.");
  return catalog;
}

async function buildCatalog() {
  if (!(await exists(OUT_DIR))) await fs.mkdir(OUT_DIR, { recursive: true });

  const payloads = await scanPayloads();
  const bySha = {};
  for (const p of payloads) (bySha[p.sha256] ||= []).push(p.filename);
  const duplicates = Object.entries(bySha).filter(([_, arr]) => arr.length > 1).map(([sha, arr]) => ({ sha, files: arr }));
  if (duplicates.length) neonWarn(`Detected ${duplicates.length} duplicate SHA256 hashes!`);

  const git = runGitMeta();
  const catalog = { generated_at: new Date().toISOString(), git, payloads, duplicates };
  await fs.writeFile(OUT_FILE, JSON.stringify(catalog, null, 2));
  neonSuccess(`Catalog JSON written → ${OUT_FILE}`);

  if(opts.ci){
    console.log("CI-SUMMARY-JSON:", JSON.stringify({
      ok: duplicates.length === 0,
      totalFiles: payloads.length,
      duplicates: duplicates.length
    }));
  }
}

buildCatalog().catch(err => {
  neonWarn(`💥 Fatal error in gen-catalog: ${err.message}`);
  process.exit(3);
});
