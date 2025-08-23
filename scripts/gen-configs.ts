// scripts/gen-configs.ts
import * as fs from "fs";
import * as path from "path";

const OUTDIR = "apps/loader/public/obfuscated";
const LOADER = "apps/loader/public/index.html";
const MANIFEST = "apps/loader/public/manifest.json";
const CATALOG = "apps/loader/public/catalog.html";
const INDEX_TEMPLATE = "scripts/index-template.html";
const CATALOG_TEMPLATE = "scripts/catalog-template.html";

// Utility: Recursively find all .js.b64 files in OUTDIR
function listB64Files(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  let files: string[] = [];
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const rel = path.relative(OUTDIR, full);
    if (fs.statSync(full).isDirectory()) {
      files = files.concat(listB64Files(full).map(f => path.join(entry, f)));
    } else if (entry.endsWith(".js.b64")) {
      files.push(rel);
    }
  }
  // Sort for deterministic builds
  return files.sort();
}

// Generate index.html loader
function generateIndexHtml(files: string[]) {
  const template = fs.readFileSync(INDEX_TEMPLATE, "utf8");
  const json = JSON.stringify(files, null, 2);
  const output = template.replace("__SPOOF_TARGETS__", json);
  fs.writeFileSync(LOADER, output, "utf8");
  console.log(`Generated: ${LOADER}`);
}

// Generate manifest.json
function generateManifest(files: string[]) {
  fs.writeFileSync(MANIFEST, JSON.stringify(files, null, 2), "utf8");
  console.log(`Generated: ${MANIFEST}`);
}

// Generate catalog.html
function generateCatalog(files: string[]) {
  const template = fs.readFileSync(CATALOG_TEMPLATE, "utf8");
  const listHtml = files
    .map(file => `<li><span class="url">${file}</span></li>`)
    .join("");
  const output = template.replace("__CATALOG_LIST__", listHtml);
  fs.writeFileSync(CATALOG, output, "utf8");
  console.log(`Generated: ${CATALOG}`);
}

// Main entry
function main() {
  // Ensure OUTDIR exists
  if (!fs.existsSync(OUTDIR)) fs.mkdirSync(OUTDIR, { recursive: true });
  const files = listB64Files(OUTDIR);
  generateIndexHtml(files);
  generateManifest(files);
  generateCatalog(files);
}

main();
