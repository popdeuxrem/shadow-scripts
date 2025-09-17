#!/usr/bin/env node
/**
 * scripts/gen-dashboard.js — Cyberpunk Neon Dashboard Generator
 * ──────────────────────────────────────────────────────────────
 * Generates self-contained HTML dashboards:
 *   - apps/loader/public/catalog.html
 *   - apps/loader/public/manifest.html
 * 
 * Features:
 *   - Uses templates from scripts/ by default
 *   - Embeds manifest.json directly (no runtime fetch)
 *   - Adds ASCII neon banner + build metadata
 *   - Supports --ci for JSON summary
 *   - Dark/cyberpunk neon style with preview tables
 */

import fs from "fs/promises";
import path from "path";

const ROOT = path.resolve(new URL(import.meta.url).pathname, "..", "..");
const PUBLIC = path.join(ROOT, "apps", "loader", "public");
const SCRIPTS = path.join(ROOT, "scripts");
const MANIFEST_PATH = path.join(PUBLIC, "manifest.json");

const argv = process.argv.slice(2);
const opts = { ci: argv.includes("--ci") };

async function exists(p) {
  try { await fs.access(p); return true; }
  catch { return false; }
}

async function loadManifest() {
  const raw = await fs.readFile(MANIFEST_PATH, "utf8");
  return JSON.parse(raw);
}

function asciiBanner(manifest) {
  return `
<pre style="color:#0ff; font-size:12px; line-height:1.2em; margin-bottom:1em;">
███████╗██╗  ██╗ █████╗ ██████╗  ██████╗ ██╗    ██╗     ██████╗ ███████╗
██╔════╝██║  ██║██╔══██╗██╔══██╗██╔═══██╗██║    ██║    ██╔═══██╗██╔════╝
███████╗███████║███████║██████╔╝██║   ██║██║ █╗ ██║    ██║   ██║███████╗
╚════██║██╔══██║██╔══██║██╔══██╗██║   ██║██║███╗██║    ██║   ██║╚════██║
███████║██║  ██║██║  ██║██║  ██║╚██████╔╝╚███╔███╔╝    ╚██████╔╝███████║
╚══════╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝ ╚═════╝  ╚══╝╚══╝      ╚═════╝ ╚══════╝
</pre>
<div style="color:#ff00ff; margin-bottom:1em;">
  Build: ${manifest.version_tag} | Files: ${manifest.counts.totalFiles} | Size: ${manifest.counts.totalSize} bytes
</div>
`;
}

async function renderTemplate(templateFile, outFile, manifest) {
  const templatePath = path.join(SCRIPTS, templateFile);
  if (!(await exists(templatePath))) {
    console.warn("Template missing:", templatePath);
    return false;
  }

  let html = await fs.readFile(templatePath, "utf8");

  // Inject manifest
  html = html.replace("__INJECT_MANIFEST__", JSON.stringify(manifest, null, 2));

  // Inject ASCII banner
  html = html.replace("<body>", `<body>\n${asciiBanner(manifest)}`);

  const outPath = path.join(PUBLIC, outFile);
  await fs.writeFile(outPath, html);
  console.log(`✅ Wrote dashboard -> ${outPath}`);
  return true;
}

async function buildDashboards() {
  if (!(await exists(MANIFEST_PATH))) {
    console.error("❌ Manifest not found:", MANIFEST_PATH);
    process.exit(2);
  }

  const manifest = await loadManifest();

  const catalogOK = await renderTemplate("catalog-template.html", "catalog.html", manifest);
  const manifestOK = await renderTemplate("manifest-template.html", "manifest.html", manifest);

  if (opts.ci) {
    const summary = {
      ok: catalogOK && manifestOK,
      totalFiles: manifest.counts?.totalFiles || 0,
      totalSize: manifest.counts?.totalSize || 0,
    };
    console.log("CI-SUMMARY-JSON:", JSON.stringify(summary));
  }
}

buildDashboards().catch(err => {
  console.error("❌ Fatal error in gen-dashboard:", err);
  process.exit(3);
});
