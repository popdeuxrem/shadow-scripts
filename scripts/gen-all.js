#!/usr/bin/env node
/**
 * gen-all.js v4.1.0
 * ─────────────────────────────────────────────
 * Unified All-in-One Config Generator
 * Enhancements:
 *  - Auto-install missing Node dependencies
 *  - Fail-safe per generator
 *  - Debug logging
 *  - Step timers
 */

import fs from "fs";
import path from "path";
import { execSync } from "child_process";

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////
const DEBUG = process.argv.includes("--debug");
function logInfo(msg)    { console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`); }
function logSuccess(msg) { console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`); }
function logWarn(msg)    { console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`); }
function logError(msg)   { console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`); }

function debug(msg) { if (DEBUG) console.log(`\x1b[90m[DEBUG]\x1b[0m ${msg}`); }

function gitCommit() {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
}

function stepBanner(step, total, title) {
  console.log(`\n\x1b[35m=== [${step}/${total}] ${title} ===\x1b[0m`);
}

function ensureDir(dir) { fs.mkdirSync(dir, { recursive: true }); }
function fileExists(file) { return fs.existsSync(file); }

////////////////////////////////////////////////////////////////////////////////
// Node Runner
////////////////////////////////////////////////////////////////////////////////
function runNode(script, args = []) {
  const ROOT_DIR = path.resolve(".");
  const scriptPath = path.resolve(ROOT_DIR, "scripts", script);
  if (!fileExists(scriptPath)) {
    logWarn(`Script missing: ${script}`);
    return { ok: false, error: "missing" };
  }
  try {
    const cmd = `node ${scriptPath} ${args.join(" ")}`;
    debug(`Running: ${cmd}`);
    const result = execSync(cmd, { encoding: "utf-8" });
    logSuccess(`✅ ${script} → OK`);
    return { ok: true, output: result.trim() };
  } catch (err) {
    logWarn(`❌ ${script} failed: ${err.message}`);
    return { ok: false, error: err.message };
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
// Dependency Auto-Check
////////////////////////////////////////////////////////////////////////////////
function ensureDependencies(pkgs = ["js-yaml"]) {
  pkgs.forEach(pkg => {
    try { require.resolve(pkg); }
    catch {
      logWarn(`Dependency missing: ${pkg}, installing...`);
      execSync(`pnpm add -D ${pkg}`, { stdio: DEBUG ? "inherit" : "ignore" });
      logSuccess(`Installed: ${pkg}`);
    }
  });
}

////////////////////////////////////////////////////////////////////////////////
// Main Pipeline
////////////////////////////////////////////////////////////////////////////////
async function main() {
  const startTime = Date.now();
  let step = 1;
  const totalSteps = 8;

  ensureDependencies(["js-yaml"]);

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
    const normalized = path.basename(gen).replace("gen-", "").replace(".js", ".conf");
    const outFile = path.join(OUT_DIR, normalized);
    const res = runNode(gen, ["--outdir=" + OUT_DIR]);
    return { generator: gen, output: outFile, ok: res.ok, error: res.error || null };
  });

  stepBanner(step++, totalSteps, "Generating manifest & loaders");
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