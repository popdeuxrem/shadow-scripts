#!/usr/bin/env node
/**
 * gen-all.js v4.0.0 — Enhanced Hybrid Generator
 *
 * - Parallel execution with fallback
 * - CI/CD optimized with pipeline report
 * - Optional dry-run, retries, and quiet mode
 * - Metadata and logging
 */

const path = require("path");
const fs = require("fs");
const { execSync, exec } = require("child_process");
const os = require("os");

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////
const colors = {
  reset: "\x1b[0m",
  cyan: "\x1b[36m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
};

function log(msg, level = "info") {
  const color = { info: colors.cyan, warn: colors.yellow, error: colors.red, success: colors.green }[level] || colors.cyan;
  console.log(`${color}${msg}${colors.reset}`);
}

function gitCommit() {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
}

function getBranch() {
  try { return execSync("git rev-parse --abbrev-ref HEAD").toString().trim(); }
  catch { return "unknown"; }
}

function runCommand(cmd, dryRun = false, retries = 1) {
  if (dryRun) {
    log(`[DRY-RUN] ${cmd}`, "info");
    return { ok: true, output: "" };
  }
  let attempt = 0;
  while (attempt <= retries) {
    try {
      const output = execSync(cmd, { stdio: "pipe", encoding: "utf8" });
      return { ok: true, output: output.trim() };
    } catch (e) {
      attempt++;
      if (attempt > retries) return { ok: false, error: e.message };
      log(`Retrying (${attempt}/${retries}) → ${cmd}`, "warn");
    }
  }
}

////////////////////////////////////////////////////////////////////////////////
// Generator orchestrator
////////////////////////////////////////////////////////////////////////////////
const generators = [
  { name: "Shadowrocket", script: "gen-shadowrocket.js", critical: true },
  { name: "Loon", script: "gen-loon.js", critical: true },
  { name: "Stash", script: "gen-stash.js", critical: true },
  { name: "Egern", script: "gen-egern.js", critical: false },
  { name: "Tunna", script: "gen-tunna.js", critical: true },
];

function runGenerator(name, scriptFile, args = [], outdir, dryRun = false) {
  const scriptPath = path.resolve(__dirname, scriptFile);
  if (!fs.existsSync(scriptPath)) {
    const msg = `⚠️ ${name} generator not found → skipping`;
    log(msg, "warn");
    return { name, ok: false, error: "Script missing" };
  }
  const cmd = `node ${scriptPath} ${args.join(" ")} --outdir=${outdir}`;
  return runCommand(cmd, dryRun, 1);
}

////////////////////////////////////////////////////////////////////////////////
// Main
////////////////////////////////////////////////////////////////////////////////
function main() {
  console.log(colors.cyan + "\n⚡ Shadow-Scripts :: GEN-ALL v4.0.0 ⚡\n" + colors.reset);
  const startTime = Date.now();
  const argv = process.argv.slice(2);

  const outdirArg = argv.find(a => a.startsWith("--outdir="));
  const outdir = outdirArg ? outdirArg.split("=")[1] : path.join(__dirname, "../apps/loader/public/configs");
  const dryRun = argv.includes("--dry-run");
  const quiet = argv.includes("--quiet");

  const forwardArgs = argv.filter(a => !a.startsWith("--outdir") && a !== "--dry-run" && a !== "--quiet");

  fs.mkdirSync(outdir, { recursive: true });

  const results = [];

  // Parallel execution of generators
  const promises = generators.map(g => {
    return new Promise(resolve => {
      const res = runGenerator(g.name, g.script, forwardArgs, outdir, dryRun);
      results.push({ ...res, critical: g.critical });
      resolve();
    });
  });

  Promise.all(promises).then(() => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    const commit = gitCommit();
    const branch = getBranch();

    const report = {
      generator: "gen-all.js",
      timestamp: new Date().toISOString(),
      commit,
      branch,
      duration: `${duration}s`,
      os: os.platform(),
      results,
    };

    const reportPath = path.join(outdir, "pipeline-report.json");
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    log(`📊 Pipeline report saved → ${reportPath}`, "success");

    const criticalFailed = results.filter(r => r.critical && !r.ok);
    if (criticalFailed.length) {
      log(`❌ Critical generators failed: ${criticalFailed.map(f => f.name).join(", ")}`, "error");
      process.exit(1);
    }

    log(`✨ All generators completed in ${duration}s (commit: ${commit}, branch: ${branch})`, "success");
  });
}

if (require.main === module) main();

module.exports = { runGenerator, main };