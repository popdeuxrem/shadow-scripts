#!/usr/bin/env node
/**
 * scripts/gen-all.js v3.0.0
 * ─────────────────────────────────────────────
 * Cyberpunk All-in-One Config Generator
 *
 * Generates configs for:
 *   - Shadowrocket
 *   - Loon
 *   - Stash
 *   - Egern
 *   - Tunna
 *
 * Features:
 *  - Unified CLI with forwarded flags
 *  - Hardened defaults + metadata collection
 *  - Neon cyberpunk dashboard summary
 *  - Pipeline JSON report (CI/CD friendly)
 *  - Safe fallback if any generator fails
 */

const path = require("path");
const fs = require("fs");
const { execSync } = require("child_process");

////////////////////////////////////////////////////////////////////////////////
// Helpers
////////////////////////////////////////////////////////////////////////////////
function gitCommit() {
  try { return execSync("git rev-parse --short HEAD").toString().trim(); }
  catch { return "unknown"; }
}

function banner() {
  console.log(`
███████╗ ██████╗ ██████╗ ███╗   ██╗     █████╗ ██╗     ██╗     
██╔════╝██╔═══██╗██╔══██╗████╗  ██║    ██╔══██╗██║     ██║     
█████╗  ██║   ██║██████╔╝██╔██╗ ██║    ███████║██║     ██║     
██╔══╝  ██║   ██║██╔═══╝ ██║╚██╗██║    ██╔══██║██║     ██║     
██║     ╚██████╔╝██║     ██║ ╚████║    ██║  ██║███████╗███████╗
╚═╝      ╚═════╝ ╚═╝     ╚═╝  ╚═══╝    ╚═╝  ╚═╝╚══════╝╚══════╝
        ⚡ Shadow-Scripts :: GRO ⚡
  `);
}

////////////////////////////////////////////////////////////////////////////////
// Generators
////////////////////////////////////////////////////////////////////////////////
function runGenerator(name, scriptFile, args) {
  const scriptPath = path.resolve(__dirname, scriptFile);
  if (!fs.existsSync(scriptPath)) {
    console.warn(`⚠️ ${name} generator not found → skipping`);
    return { name, ok: false, error: "Script missing" };
  }

  try {
    const result = execSync(`node ${scriptPath} ${args.join(" ")}`, { encoding: "utf8" });
    console.log(`✅ ${name} → OK`);
    return { name, ok: true, output: result.trim() };
  } catch (err) {
    console.error(`❌ ${name} failed: ${err.message}`);
    return { name, ok: false, error: err.message };
  }
}

////////////////////////////////////////////////////////////////////////////////
// Main
////////////////////////////////////////////////////////////////////////////////
function main() {
  banner();
  const start = Date.now();

  const argv = process.argv.slice(2);
  const forwardArgs = argv.filter(a => !a.startsWith("--outdir"));
  const outdirArg = argv.find(a => a.startsWith("--outdir="));
  const outdir = outdirArg ? outdirArg.split("=")[1] : path.join(__dirname, "../apps/loader/public/configs");

  const results = [];
  results.push(runGenerator("Shadowrocket", "gen-shadowrocket.js", forwardArgs));
  results.push(runGenerator("Loon", "gen-loon.js", forwardArgs));
  results.push(runGenerator("Stash", "gen-stash.js", forwardArgs));
  results.push(runGenerator("Egern", "gen-egern.js", forwardArgs));
  results.push(runGenerator("Tunna", "gen-tunna.js", forwardArgs));

  const duration = ((Date.now() - start) / 1000).toFixed(2);
  const commit = gitCommit();

  const report = {
    generator: "gen-all.js",
    timestamp: new Date().toISOString(),
    commit,
    duration: `${duration}s`,
    results
  };

  const reportPath = path.join(outdir, "pipeline-report.json");
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  console.log(`📊 Pipeline report saved → ${reportPath}`);

  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✨ ENERATION COMPLETE
  ⏱ Duration: ${duration}s
  🌐 Commit: ${commit}
  📦 Report: ${reportPath}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
}

if (require.main === module) main();
module.exports = { parseArgs: argv => argv.slice(2), runGenerator, main };
