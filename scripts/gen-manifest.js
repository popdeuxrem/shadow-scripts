#!/usr/bin/env node
/**
 * scripts/gen-manifest.js — Cyberpunk Futuristic Manifest Generator
 * ---------------------------------------------------------------
 * Generates apps/loader/public/manifest.json by merging asset integrity with catalog metadata.
 * Features:
 *   - Scans apps/loader/public/obfuscated for .b64 and .ob.js
 *   - Computes SHA256 + SHA512
 *   - Detects duplicates
 *   - Adds first N lines preview
 *   - Embeds Git commit, branch, date
 *   - CI-friendly JSON summary
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { spawnSync } from "child_process";

const ROOT = path.resolve(new URL(import.meta.url).pathname, "..", "..");
const PUBLIC = path.join(ROOT, "apps", "loader", "public");
const OBF_DIR = path.join(PUBLIC, "obfuscated");
const OUT = path.join(PUBLIC, "manifest.json");

const argv = process.argv.slice(2);
const opts = {
  ci: argv.includes("--ci"),
  previewLines: Number(process.env.MANIFEST_PREVIEW_LINES || 8),
  baseUrl: process.env.MANIFEST_BASE_URL || "https://popdeuxrem.github.io/shadow-scripts",
};

async function exists(fp) {
  try { await fs.access(fp); return true; } 
  catch { return false; }
}

function shaHex(alg, buf) {
  return crypto.createHash(alg).update(buf).digest("hex");
}

function gitMeta() {
  try {
    const sha = spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const branch = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], { encoding: "utf8" }).stdout.trim();
    const date = spawnSync("git", ["show", "-s", "--format=%cI", sha], { encoding: "utf8" }).stdout.trim();
    return { sha, branch, date };
  } catch {
    return null;
  }
}

async function readPreview(file, maxLines) {
  try {
    const txt = await fs.readFile(file, "utf8");
    const lines = txt.split(/\r?\n/);
    return {
      preview: lines.slice(0, maxLines).join("\n"),
      lines: lines.length,
      truncated: lines.length > maxLines
    };
  } catch {
    return null;
  }
}

async function scanAssets() {
  if (!(await exists(OBF_DIR))) throw new Error(`Obfuscated directory not found: ${OBF_DIR}`);
  const files = (await fs.readdir(OBF_DIR)).filter(f => f.endsWith(".b64") || f.endsWith(".ob.js")).sort();
  const assets = [];
  for (const f of files) {
    const fp = path.join(OBF_DIR, f);
    const buf = await fs.readFile(fp);
    const st = await fs.stat(fp);
    const preview = await readPreview(fp, opts.previewLines);
    assets.push({
      filename: f,
      url: `${opts.baseUrl}/obfuscated/${f}`,
      size: st.size,
      mtime: st.mtime.toISOString(),
      sha256: shaHex("sha256", buf),
      sha512: shaHex("sha512", buf),
      mimeHint: f.endsWith(".b64") ? "application/base64" : "application/javascript",
      sample: preview
    });
  }
  return assets;
}

async function generateManifest() {
  const assets = await scanAssets();

  // Detect duplicates
  const bySha = {};
  for (const a of assets) (bySha[a.sha256] ||= []).push(a.filename);
  const duplicates = Object.entries(bySha)
    .filter(([_, arr]) => arr.length > 1)
    .map(([sha, arr]) => ({ sha, files: arr }));

  const git = gitMeta();

  const loaderUrl = `${opts.baseUrl}/index.html`;
  const catalogUrl = `${opts.baseUrl}/manifest.json`;
  const qrCatalogPath = path.join(PUBLIC, "qrcodes", "catalog.json");
  const qrCatalogUrl = (await exists(qrCatalogPath)) ? `${opts.baseUrl}/qrcodes/catalog.json` : null;

  const manifest = {
    generated_at: new Date().toISOString(),
    version_tag: `build-${Math.floor(Date.now() / 1000)}`,
    base_url: opts.baseUrl,
    git,
    counts: {
      totalFiles: assets.length,
      totalSize: assets.reduce((sum, f) => sum + f.size, 0)
    },
    assets,
    duplicates,
    references: {
      loader: (await exists(path.join(PUBLIC, "index.html"))) ? loaderUrl : null,
      catalog: catalogUrl,
      qr_catalog: qrCatalogUrl
    }
  };

  await fs.writeFile(OUT, JSON.stringify(manifest, null, 2));
  console.log(`✅ Wrote manifest → ${OUT}`);

  if (opts.ci) {
    const summary = {
      ok: duplicates.length === 0,
      totalFiles: manifest.counts.totalFiles,
      totalSize: manifest.counts.totalSize,
      duplicates: manifest.duplicates.length,
      hasLoader: !!manifest.references.loader,
      hasQRCatalog: !!manifest.references.qr_catalog
    };
    console.log("CI-SUMMARY-JSON:", JSON.stringify(summary));
  }
}

generateManifest().catch(err => {
  console.error("❌ Fatal error generating manifest:", err);
  process.exit(1);
});
