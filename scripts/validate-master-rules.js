#!/usr/bin/env node
/**
 * validate-master-rules.js — Cyberpunk Enhanced Master Rules Validator
 * -------------------------------------------------------------------
 * Validates `configs/master-rules.yaml` with:
 *  - Schema checks (meta, proxies, groups, rules, mitm_hostnames, scripts)
 *  - Ensures mandatory fields are present
 *  - Detects duplicates & malformed entries
 *  - Warns for sensitive MITM hostnames (paypal, stripe, apple, bank, etc.)
 *  - Outputs cyberpunk neon logging
 *
 * Exit codes:
 *   0 = success
 *   1 = warnings only (non-fatal issues)
 *   2 = errors (pipeline should fail)
 */

import fs from "fs";
import path from "path";
import yaml from "js-yaml";
import crypto from "crypto";
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MASTER_RULES = path.join(ROOT, "configs/master-rules.yaml");

// Simple console colors without chalk dependency
const colors = {
  cyan: (text) => `\x1b[36m${text}\x1b[0m`,
  yellow: (text) => `\x1b[33m${text}\x1b[0m`,
  red: (text) => `\x1b[31m${text}\x1b[0m`,
  green: (text) => `\x1b[32m${text}\x1b[0m`
};

const log = (msg) => console.log(colors.cyan("[⚡ VALIDATOR]"), msg);
const warn = (msg) => console.warn(colors.yellow("[⚠️ WARNING]"), msg);
const err = (msg) => console.error(colors.red("[❌ ERROR]"), msg);
const ok = (msg) => console.log(colors.green("[✔ OK]"), msg);

function sha256(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function validateFile() {
  if (!fs.existsSync(MASTER_RULES)) {
    err(`Missing master rules file: ${MASTER_RULES}`);
    process.exit(2);
  }

  const raw = fs.readFileSync(MASTER_RULES, "utf8");
  let doc;
  try {
    doc = yaml.load(raw);
  } catch (e) {
    err(`YAML parse error: ${e.message}`);
    process.exit(2);
  }

  if (!doc || typeof doc !== "object") {
    err("Invalid master rules structure: root is not a mapping");
    process.exit(2);
  }

  let hasErrors = false;
  let hasWarnings = false;

  // -----------------------
  // Meta
  // -----------------------
  if (!doc.meta || typeof doc.meta !== "object") {
    warn("Missing 'meta' section");
    hasWarnings = true;
  } else {
    ["version", "author", "description"].forEach((k) => {
      if (!doc.meta[k]) {
        warn(`meta.${k} is missing`);
        hasWarnings = true;
      }
    });
  }

  // -----------------------
  // Proxies
  // -----------------------
  if (!doc.proxies || typeof doc.proxies !== "object") {
    err("Missing or invalid 'proxies' section");
    hasErrors = true;
  } else {
    Object.entries(doc.proxies).forEach(([region, arr]) => {
      if (!Array.isArray(arr)) {
        err(`proxies.${region} is not an array`);
        hasErrors = true;
      } else {
        arr.forEach((p, i) => {
          ["name", "type", "host", "port"].forEach((k) => {
            if (!p[k]) {
              err(`proxies.${region}[${i}] missing field '${k}'`);
              hasErrors = true;
            }
          });
        });
      }
    });
  }

  // -----------------------
  // Groups
  // -----------------------
  if (!doc.groups || !Array.isArray(doc.groups)) {
    err("Missing or invalid 'groups' section");
    hasErrors = true;
  } else {
    const groupNames = new Set();
    doc.groups.forEach((g, i) => {
      if (!g.name || !g.type) {
        err(`groups[${i}] missing 'name' or 'type'`);
        hasErrors = true;
      } else if (groupNames.has(g.name)) {
        warn(`Duplicate group name detected: ${g.name}`);
        hasWarnings = true;
      } else {
        groupNames.add(g.name);
      }
    });
  }

  // -----------------------
  // Rules
  // -----------------------
  if (!doc.rules || !Array.isArray(doc.rules)) {
    err("Missing or invalid 'rules' section");
    hasErrors = true;
  } else {
    doc.rules.forEach((r, i) => {
      if (typeof r === "string") return;
      if (!r.type || !r.value) {
        warn(`rules[${i}] missing 'type' or 'value'`);
        hasWarnings = true;
      }
    });
  }

  // -----------------------
  // MITM Hostnames
  // -----------------------
  if (Array.isArray(doc.mitm_hostnames)) {
    const sensitive = doc.mitm_hostnames.filter((h) =>
      /(paypal|apple|google|login|bank|stripe|icloud)/i.test(h)
    );
    if (sensitive.length > 0) {
      warn(
        `Sensitive MITM hostnames detected: ${sensitive.join(", ")} (require explicit ALLOW_SENSITIVE=true)`
      );
      hasWarnings = true;
    }
  }

  // -----------------------
  // Scripts
  // -----------------------
  if (doc.scripts && typeof doc.scripts === "object") {
    Object.entries(doc.scripts).forEach(([name, s]) => {
      if (!s.url) {
        warn(`scripts.${name} missing 'url'`);
        hasWarnings = true;
      }
      if (!s.integrity) {
        warn(`scripts.${name} missing 'integrity' hash`);
        hasWarnings = true;
      }
    });
  }

  // -----------------------
  // Integrity hash
  // -----------------------
  const hash = sha256(raw);
  ok(`Integrity SHA256: ${hash}`);

  // -----------------------
  // Final status
  // -----------------------
  if (hasErrors) {
    err("Validation failed due to errors.");
    process.exit(2);
  } else if (hasWarnings) {
    warn("Validation completed with warnings.");
    process.exit(1);
  } else {
    ok("Validation successful. Master rules are valid.");
    process.exit(0);
  }
}

validateFile();
