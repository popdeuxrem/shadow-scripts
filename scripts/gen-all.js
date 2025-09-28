#!/usr/bin/env node
/**
 * gen-all.js v4.0.0
 * ─────────────────────────────────────────────
 * Unified All-in-One Config Generator
 * Handles:
 *   - Shadowrocket / Loon / Stash / Tunna / Egern / Mobileconfig
 *   - Obfuscation
 *   - Dashboard & index loader
 *   - Catalog
 *   - QR codes
 *   - Pipeline JSON report
 *   - CI/CD friendly
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////
function logInfo(msg)    { console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`); }
function logSuccess(msg) { console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`); }
function logWarn(msg)    { console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`); }
function logError(msg)   { console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`); }

function gitCommit() {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
}

function stepBanner(step, total, title) {
  console.log(`\n\x1b[35m=== [${step}/${total}] ${title} ===\x1b[0m`);
}

function runCommand(cmd, args = []) {
  try {
    return execSync([cmd, ...args].join(" "), { encoding: "utf-8" });
  } catch (err) {
    logWarn(`Command failed: ${cmd} ${args.join(" ")} → ${err.message}`);
    return null;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Paths & Environment
////////////////////////////////////////////////////////////////////////////////
const ROOT_DIR = path.resolve(".");
const OUT_DIR = (() => {
  const arg = process.argv.find(a => a.startsWith("--outdir="));
  return arg ? arg.split("=")[1] : path.join(ROOT_DIR, "apps/loader/public/configs");
})();
const QR_DIR = path.join(ROOT_DIR, "apps/loader/public/qrcodes");
const BUILD_CACHE = path.join(ROOT_DIR, ".build-cache");
const GIT_HASH = gitCommit();
const VERSION = process.env.VERSION || "0.0.0";

////////////////////////////////////////////////////////////////////////////////
// Utilities
////////////////////////////////////////////////////////////////////////////////
function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function fileExists(file) { return fs.existsSync(file); }
function runNode(script, args = []) {
  const scriptPath = path.resolve(ROOT_DIR, "scripts", script);
  if (!fileExists(scriptPath)) {
    logWarn(`Script missing: ${script}`);
    return null;
  }
  try {
    const result = execSync(`node ${scriptPath} ${args.join(" ")}`, { encoding: "utf-8" });
    logSuccess(`✅ ${script} → OK`);
    return result.trim();
  } catch (err) {
    logWarn(`❌ ${script} failed: ${err.message}`);
    return null;
  }
}

////////////////////////////////////////////////////////////////////////////////
// Main Pipeline
////////////////////////////////////////////////////////////////////////////////
async function main() {
  const startTime = Date.now();
  let step = 1;
  const totalSteps = 7;

  stepBanner(step++, totalSteps, "Obfuscating payloads");
  ensureDir(path.join(ROOT_DIR, "apps/loader/public/obfuscated"));
  runNode("obfuscate-all.js", ["--profile=medium"]);

  stepBanner(step++, totalSteps, "Generating all configs");
  ensureDir(OUT_DIR);
  const generators = [
    "gen-shadowrocket.js",
    "gen-loon.js",
    "gen-stash.js",
    "gen-mobileconfig.js",
    "gen-tunna.js",
    "gen-egern.js",
  ];
  const results = generators.map(gen => {
    const outFile = path.join(OUT_DIR, path.basename(gen).replace("gen-", "").replace(".js", ".conf"));
    runNode(gen, ["--outdir=" + OUT_DIR]);
    return { generator: gen, output: outFile };
  });

  stepBanner(step++, totalSteps, "Generating manifest & loader");
  runNode("gen-manifest.js", ["--ci"]);
  runNode("gen-dashboard.js", ["--ci"]);
  runNode("gen-index-loader.js", ["--ci"]);
  runNode("gen-catalog.js", ["--ci"]);

  stepBanner(step++, totalSteps, "Generating QR codes");
  ensureDir(QR_DIR);
  runNode("gen-qrcodes.js", ["--output", QR_DIR, "--version", GIT_HASH]);

  stepBanner(step++, totalSteps, "Validating configs & gitignore");
  runNode("validate-gitignore.js");
  runNode("validate-configs.js");

  stepBanner(step++, totalSteps, "Writing pipeline report");
  ensureDir(OUT_DIR);
  const report = {
    timestamp: new Date().toISOString(),
    commit: GIT_HASH,
    version: VERSION,
    duration_s: ((Date.now() - startTime)/1000).toFixed(2),
    results
  };
  fs.writeFileSync(path.join(OUT_DIR, "pipeline-report.json"), JSON.stringify(report, null, 2));
  logSuccess(`Pipeline report written: ${OUT_DIR}/pipeline-report.json`);

  stepBanner(step++, totalSteps, "Build summary");
  console.log("──────────────────────────────");
  console.log(`📦 Obfuscated payloads: ${fs.readdirSync(path.join(ROOT_DIR, "apps/loader/public/obfuscated")).length}`);
  console.log(`⚙️ Configs generated: ${OUT_DIR}`);
  console.log(`🔗 QR codes: ${QR_DIR}/*`);
  console.log("──────────────────────────────");

  logSuccess(`Total pipeline duration: ${((Date.now() - startTime)/1000).toFixed(2)}s`);
}

////////////////////////////////////////////////////////////////////////////////
// Execute
////////////////////////////////////////////////////////////////////////////////
if (require.main === module) {
  main().catch(err => {
    logError(`Pipeline failed: ${err.message}`);
    process.exit(1);
  });
}

export { runNode, stepBanner, ensureDir };