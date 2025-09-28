#!/usr/bin/env node
/**
 * scripts/validate-gitignore.js
 * ───────────────────────────────────────────────
 * Validates the .gitignore file for Shadow Scripts repository.
 * Allows pnpm-lock.yaml to be missing.
 */

import fs from "fs";
import path from "path";

const REQUIRED_PATTERNS = [
  "node_modules/",
  ".build-cache/",
  "apps/loader/public/",
  "dist/",
  "*.log"
  // "pnpm-lock.yaml" removed from REQUIRED_PATTERNS
];

const OPTIONAL_PATTERNS = [
  "pnpm-lock.yaml"
];

const GITIGNORE_PATH = path.resolve(process.cwd(), ".gitignore");
const CI_MODE = process.argv.includes("--ci");

function logInfo(msg) {
  console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`);
}
function logWarn(msg) {
  console.warn(`\x1b[33m[WARN]\x1b[0m ${msg}`);
}
function logError(msg) {
  console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`);
}

function loadGitignore() {
  try {
    return fs.readFileSync(GITIGNORE_PATH, "utf8").split(/\r?\n/).map(l => l.trim());
  } catch {
    logError(".gitignore not found in repository root.");
    process.exit(1);
  }
}

function validateGitignore() {
  const lines = loadGitignore();
  const missingRequired = [];

  for (const pattern of REQUIRED_PATTERNS) {
    if (!lines.includes(pattern)) missingRequired.push(pattern);
  }

  const missingOptional = OPTIONAL_PATTERNS.filter(p => !lines.includes(p));

  if (missingRequired.length > 0) {
    missingRequired.forEach(p => logWarn(`Missing required pattern: ${p}`));
    if (CI_MODE) console.log(JSON.stringify({ ok: false, missing: missingRequired }));
    process.exit(2);
  }

  if (missingOptional.length > 0) {
    missingOptional.forEach(p => logWarn(`Optional pattern missing: ${p}`));
    // Do NOT exit; optional patterns just warn
    if (CI_MODE) console.log(JSON.stringify({ ok: true, missingOptional }));
  }

  logInfo("All required .gitignore patterns are present.");
  if (CI_MODE) console.log(JSON.stringify({ ok: true, missingRequired: [], missingOptional }));
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("validate-gitignore.js")) {
  validateGitignore();
}

export { validateGitignore };