#!/usr/bin/env node
/**
 * scripts/gen-qrcodes.js — Cyberpunk QR Catalog Generator
 * ──────────────────────────────────────────────────────────────
 * - Scans /configs (*.conf, *.mobileconfig) and loader assets
 * - Generates PNG + SVG + optional inline Base64 data URIs
 * - Produces a JSON catalog for loader integration
 * - Neon cyberpunk style logging
 * - CI-friendly summary with --ci
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";

const ROOT = path.resolve(new URL(import.meta.url).pathname, "..", "..");
const CONFIGS = path.join(ROOT, "configs");
const PUBLIC = path.join(ROOT, "apps/loader/public");
const QR_DIR = path.join(PUBLIC, "qrcodes");

const argv = process.argv.slice(2);
const opts = {
  inline: argv.includes("--inline"),
  ci: argv.includes("--ci"),
  size: Number(process.env.QR_SIZE || 512),
  baseUrl: process.env.QR_BASE_URL || "https://popdeuxrem.github.io/shadow-scripts",
};

async function ensureDir(d) {
  await fs.mkdir(d, { recursive: true });
}

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

async function exists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}

async function scanTargets() {
  const targets = [];

  // Scan configs
  if (await exists(CONFIGS)) {
    const files = await fs.readdir(CONFIGS);
    for (const f of files) {
      if (f.endsWith(".conf") || f.endsWith(".mobileconfig")) {
        targets.push({ type: "config", filename: f, path: path.join(CONFIGS, f) });
      }
    }
  }

  // Loader + manifest
  const loaderIndex = path.join(PUBLIC, "index.html");
  if (await exists(loaderIndex)) targets.push({ type: "loader", filename: "index.html", path: loaderIndex });

  const manifest = path.join(PUBLIC, "manifest.json");
  if (await exists(manifest)) targets.push({ type: "manifest", filename: "manifest.json", path: manifest });

  return targets;
}

async function genQrForTarget(target) {
  const raw = await fs.readFile(target.path);
  const sha = sha256Hex(raw);
  const content = target.type === "config" || target.type === "loader" || target.type === "manifest"
    ? `${opts.baseUrl}/${path.relative(PUBLIC, target.path).replace(/\\/g, "/")}`
    : raw.toString("utf8");

  const baseName = target.filename.replace(/\.[^.]+$/, "");
  const outPng = path.join(QR_DIR, `${baseName}.png`);
  const outSvg = path.join(QR_DIR, `${baseName}.svg`);
  const outTxt = path.join(QR_DIR, `${baseName}.txt`);

  const qrOpts = { width: opts.size, margin: 1 };

  const pngBuf = await QRCode.toBuffer(content, { type: "png", ...qrOpts });
  await fs.writeFile(outPng, pngBuf);

  const svgStr = await QRCode.toString(content, { type: "svg", ...qrOpts });
  await fs.writeFile(outSvg, svgStr, "utf8");

  if (opts.inline) {
    const dataUri = await QRCode.toDataURL(content, { width: 256 });
    await fs.writeFile(outTxt, dataUri, "utf8");
  }

  return {
    filename: target.filename,
    type: target.type,
    url: content,
    sha256: sha,
    png: path.relative(ROOT, outPng),
    svg: path.relative(ROOT, outSvg),
    inline: opts.inline ? path.relative(ROOT, outTxt) : null,
  };
}

async function main() {
  await ensureDir(QR_DIR);

  const targets = await scanTargets();
  if (!targets.length) {
    console.warn("⚠️ No QR targets found. Nothing to do.");
    return;
  }

  const results = [];
  for (const t of targets) {
    const qrMeta = await genQrForTarget(t);
    results.push(qrMeta);
    console.log(`🔹 Generated QR: ${t.filename} → ${qrMeta.png}, ${qrMeta.svg}`);
  }

  const catalog = {
    generated_at: new Date().toISOString(),
    baseUrl: opts.baseUrl,
    size: opts.size,
    inline: opts.inline,
    items: results,
  };

  const outCatalog = path.join(QR_DIR, "catalog.json");
  await fs.writeFile(outCatalog, JSON.stringify(catalog, null, 2));
  console.log(`✅ QR catalog written → ${outCatalog}`);

  if (opts.ci) {
    console.log("CI-SUMMARY-JSON:", JSON.stringify({ ok: true, count: results.length }));
  }
}

main().catch(err => {
  console.error("❌ Fatal error generating QR codes:", err);
  process.exit(2);
});
