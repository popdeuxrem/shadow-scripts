#!/usr/bin/env node
/**
 * gen-all.js v4.1.0
 * ─────────────────────────────────────────────
 * Unified All-in-One Config Generator (ES Module)
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
import { execSync, spawnSync } from "child_process";

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

function getFlagValue(flag) {
  const inline = process.argv.find(arg => arg.startsWith(`${flag}=`));
  if (inline) return inline.split("=")[1];
  const idx = process.argv.indexOf(flag);
  if (idx !== -1 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return null;
}

const OUT_DIR = (() => {
  const candidate = getFlagValue("--outdir") || process.env.CONFIG_OUTDIR;
  const fallback = path.join(ROOT_DIR, "apps/loader/public/configs");
  const resolved = candidate ?? fallback;
  return path.isAbsolute(resolved) ? resolved : path.resolve(ROOT_DIR, resolved);
})();

const OBFUSCATION_PROFILE = (() => {
  const candidate = getFlagValue("--profile") || process.env.OBFUSCATION_PROFILE;
  return candidate || "medium";
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
    return { ok: false, stdout: "", stderr: "" };
  }
  const result = spawnSync("node", [scriptPath, ...args], { encoding: "utf-8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.status === 0) {
    logSuccess(`✅ ${script} → OK`);
    return { ok: true, stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "" };
  }
  const code = typeof result.status === "number" ? ` (exit ${result.status})` : "";
  logWarn(`❌ ${script} failed${code}: ${result.error?.message || "see output above"}`);
  return { ok: false, stdout: result.stdout?.trim() ?? "", stderr: result.stderr?.trim() ?? "" };
}

////////////////////////////////////////////////////////////////////////////////
// Main Pipeline
////////////////////////////////////////////////////////////////////////////////
async function main() {
  const startTime = Date.now();
  let step = 1;
  const totalSteps = 7;

  // Step 1: Obfuscate payloads
  stepBanner(step++, totalSteps, "Obfuscating payloads");
  ensureDir(path.join(ROOT_DIR, "apps/loader/public/obfuscated"));
  logInfo(`Using obfuscation profile: ${OBFUSCATION_PROFILE}`);
  runNode("obfuscate-all.js", [`--profile=${OBFUSCATION_PROFILE}`]);

  // Step 2: Generate all configs
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
  const generatorOutputs = {
    "gen-mobileconfig.js": ["shadowrocket.mobileconfig", "loon.mobileconfig", "stash.mobileconfig", "egern.mobileconfig"],
  };
  const results = generators.map(gen => {
    const execution = runNode(gen, [`--outdir=${OUT_DIR}`]);
    const outputs = (generatorOutputs[gen] || [
      path.basename(gen).replace("gen-", "").replace(".js", ".conf"),
    ]).map(name => path.join(OUT_DIR, name));
    return {
      generator: gen,
      success: execution.ok,
      outputs: outputs.map(file => path.relative(ROOT_DIR, file)),
    };
  });

  // Step 3: Generate manifest & loaders
  stepBanner(step++, totalSteps, "Generating manifest & loader");
  runNode("gen-manifest.js", ["--ci"]);
  runNode("gen-dashboard.js", ["--ci"]);
  runNode("gen-index-loader.js", ["--ci"]);
  runNode("gen-catalog.js", ["--ci"]);

  // Step 4: Generate QR codes
  stepBanner(step++, totalSteps, "Generating QR codes");
  ensureDir(QR_DIR);
  runNode("gen-qrcodes.js", ["--output", QR_DIR, "--version", GIT_HASH]);

  // Step 5: Validate configs & gitignore
  stepBanner(step++, totalSteps, "Validating configs & gitignore");
  runNode("validate-gitignore.js");
  runNode("validate-configs.js");

  // Step 6: Write pipeline report
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

  // Step 7: Build summary
  stepBanner(step++, totalSteps, "Build summary");
  console.log("──────────────────────────────");
  console.log(`📦 Obfuscated payloads: ${fs.readdirSync(path.join(ROOT_DIR, "apps/loader/public/obfuscated")).length}`);
  console.log(`🛡️ Obfuscation profile: ${OBFUSCATION_PROFILE}`);
  console.log(`⚙️ Configs generated: ${path.relative(ROOT_DIR, OUT_DIR) || "."}`);
  console.log(`🔗 QR codes: ${QR_DIR}/*`);
  console.log("──────────────────────────────");

  logSuccess(`Total pipeline duration: ${((Date.now() - startTime)/1000).toFixed(2)}s`);
}

////////////////////////////////////////////////////////////////////////////////
// Execute (ES module compatible)
////////////////////////////////////////////////////////////////////////////////
const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch(err => {
    logError(`Pipeline failed: ${err.message}`);
    process.exit(1);
  });
}

// Exports for testing
export { runNode, stepBanner, ensureDir };
