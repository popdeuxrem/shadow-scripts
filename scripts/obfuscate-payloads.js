#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const zlib = require("zlib");
const process = require("process");

const obfuscatorBin = "javascript-obfuscator";

const SRC_DIR = process.argv.includes("--src")
  ? process.argv[process.argv.indexOf("--src") + 1]
  : "src-scripts";

const OUT_DIR = process.argv.includes("--out")
  ? process.argv[process.argv.indexOf("--out") + 1]
  : "apps/loader/public/payloads";

const TEMP_DIR = path.join(".build", "temp-obfuscated");

if (!fs.existsSync(SRC_DIR)) {
  console.error(`❌ Source dir "${SRC_DIR}" not found`);
  process.exit(1);
}

fs.rmSync(TEMP_DIR, { recursive: true, force: true });
fs.mkdirSync(TEMP_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const getAllJsFiles = (dir) => {
  return fs.readdirSync(dir).flatMap((file) => {
    const full = path.join(dir, file);
    if (fs.statSync(full).isDirectory()) return getAllJsFiles(full);
    if (file.endsWith(".js")) return [full];
    return [];
  });
};

const encodeBase64Gzip = (buffer) =>
  zlib.gzipSync(buffer).toString("base64");

const relPath = (file) =>
  path.relative(SRC_DIR, file).replace(/\\/g, "/");

const allFiles = getAllJsFiles(SRC_DIR);

console.log(`📦 Found ${allFiles.length} .js files to process...\n`);

for (const file of allFiles) {
  const relative = relPath(file);
  const tempOutPath = path.join(TEMP_DIR, relative);
  const finalOutPath = path.join(OUT_DIR, relative + ".b64");

  fs.mkdirSync(path.dirname(tempOutPath), { recursive: true });

  console.log(`⚙️  Obfuscating ${relative}...`);
  execSync(
    `${obfuscatorBin} "${file}" --output "${tempOutPath}" --compact true --self-defending true --control-flow-flattening true --string-array true`,
    { stdio: "inherit" }
  );

  const raw = fs.readFileSync(tempOutPath);
  const encoded = encodeBase64Gzip(raw);

  fs.mkdirSync(path.dirname(finalOutPath), { recursive: true });
  fs.writeFileSync(finalOutPath, encoded);

  console.log(`✅ Output: ${finalOutPath}`);
}

console.log("\n🎉 All scripts obfuscated, gzipped, and base64-encoded.");
